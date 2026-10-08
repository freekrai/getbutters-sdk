/** Awaitable, instance-scoped client for server applications. */
export interface ServerOptions {
  /** Secret API key (`ev_…`). Never include this in browser code. */
  key: string
  /** Project ID shared by this client's requests. */
  project: string
  /** Defaults to https://app.getbutters.com. */
  host?: string
  /** Request timeout in milliseconds. Defaults to 10,000. */
  timeoutMs?: number
}

export interface ServerTrackFields {
  description?: string
  icon?: string
  tags?: Record<string, string>
  metadata?: Record<string, unknown> | unknown[]
  url?: string
  /** Explicit per-event identity; never stored on the client. */
  user_id?: string
  notify?: boolean
  /** Unix seconds. */
  created_at?: number
}

export interface EventResponse {
  id: number
  projectId: string
  category: string
  title: string
  description: string | null
  icon: string | null
  tags: Record<string, string> | null
  metadata: unknown
  url: string | null
  user_id: string | null
  notify: boolean
  favorited: boolean
  createdAt: string
}

/** An HTTP failure, including the server's error message and retry guidance. */
export class ButtersError extends Error {
  readonly status: number
  readonly retryAfter: string | null

  constructor(status: number, message: string, retryAfter: string | null = null) {
    super(message)
    this.name = 'ButtersError'
    this.status = status
    this.retryAfter = retryAfter
  }
}

export class Butters {
  #key: string
  #project: string
  #host: string
  #timeoutMs: number

  constructor(options: ServerOptions) {
    if (typeof window !== 'undefined') throw new Error('Import @getbutters/js/server only in server code')
    if (typeof options?.key !== 'string' || !options.key.startsWith('ev_') || options.key.length <= 3) {
      throw new TypeError('A secret API key (ev_…) is required')
    }
    if (typeof options.project !== 'string' || !options.project.trim()) {
      throw new TypeError('A project ID is required')
    }
    const host = new URL(options.host ?? 'https://app.getbutters.com')
    if (!['https:', 'http:'].includes(host.protocol) || host.username || host.password || host.search || host.hash) {
      throw new TypeError('host must be an HTTP(S) URL without credentials, query, or fragment')
    }
    const timeoutMs = options.timeoutMs ?? 10_000
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) {
      throw new TypeError('timeoutMs must be an integer from 1 to 2147483647')
    }
    this.#key = options.key
    this.#project = options.project
    this.#host = host.href.replace(/\/+$/, '')
    this.#timeoutMs = timeoutMs
  }

  /** Create an event. Await completion before a serverless request ends. */
  track(category: string, title: string, fields: ServerTrackFields = {}): Promise<EventResponse> {
    return this.#request('/api/events', 'POST', { ...fields, category, title, project: this.#project })
  }

  /** Set user properties without changing the identity of later events. */
  identify(userId: string, properties?: Record<string, unknown>): Promise<{ ok: true }> {
    return this.#request('/api/identify', 'POST', { user_id: userId, properties, project: this.#project })
  }

  /** Create an insight or replace its display value. */
  setInsight(title: string, value: string | number, icon?: string): Promise<{ ok: true }> {
    return this.#request('/api/insight', 'POST', { title, value, icon, project: this.#project })
  }

  /** Add to a numeric insight; a negative amount subtracts. */
  incrementInsight(title: string, amount: number, icon?: string): Promise<{ ok: true }> {
    if (!Number.isFinite(amount)) return Promise.reject(new TypeError('amount must be a finite number'))
    return this.#request('/api/insight', 'PATCH', { title, $inc: amount, icon, project: this.#project })
  }

  async #request<T>(path: string, method: string, body: unknown): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.#timeoutMs)
    try {
      const response = await fetch(`${this.#host}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.#key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
        // Never forward a secret key or replay writes at a redirected URL. Workers
        // reject redirect: 'error', so take the redirect unfollowed and refuse it.
        redirect: 'manual',
      })
      if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
        throw new ButtersError(response.status, 'Get Butters request was redirected', null)
      }
      const result: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const message =
          result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
            ? result.error
            : `Get Butters request failed (${response.status})`
        throw new ButtersError(response.status, message, response.headers.get('Retry-After'))
      }
      if (result === null) throw new Error('Get Butters returned an invalid JSON response')
      return result as T
    } finally {
      clearTimeout(timer)
    }
  }
}
