export interface PostOptions {
  host: string
  key: string
  path: string
  body: unknown
  debug: boolean
}

/**
 * One fire-and-forget JSON POST. Never throws and never rejects: analytics
 * must not be able to break the page that loads it. `keepalive` lets a
 * request made just before navigation finish.
 */
export async function postJson({ host, key, path, body, debug }: PostOptions): Promise<void> {
  try {
    const response = await fetch(`${host}${path}`, {
      method: 'POST',
      keepalive: true,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok && debug) console.warn(`[butters] ${path} failed with ${response.status}`)
  } catch (error) {
    if (debug) console.warn(`[butters] ${path} failed:`, error)
  }
}
