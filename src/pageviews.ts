import type { TrackFields } from './index'

export type SendPageview = (title: string, fields: TrackFields) => void

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const
const PAGE_TITLE_MAX = 200

/**
 * One pageview's event fields. The title is the pathname only; the URL keeps
 * only `utm_*` parameters, because other query parameters can carry tokens or
 * personal data, and drops the hash.
 */
export function pageviewEvent(
  href: string,
  documentTitle: string,
  referrer: string | undefined,
): { title: string; fields: TrackFields } {
  const url = new URL(href)
  const kept = new URLSearchParams()
  const utm: Record<string, string> = {}
  for (const key of UTM_KEYS) {
    const value = url.searchParams.get(key)
    if (value !== null) {
      kept.set(key, value)
      utm[key.slice(4)] = value
    }
  }
  const query = kept.toString()

  const metadata: Record<string, unknown> = {}
  // A UTF-16 .slice() can cut a surrogate pair in half, leaving a lone
  // surrogate that Postgres jsonb rejects. Slice by code point instead.
  const pageTitle = Array.from(documentTitle).slice(0, PAGE_TITLE_MAX).join('')
  if (pageTitle) metadata.page_title = pageTitle
  if (referrer) metadata.referrer = referrer
  if (Object.keys(utm).length > 0) metadata.utm = utm

  return {
    title: url.pathname,
    fields: {
      url: `${url.origin}${url.pathname}${query ? `?${query}` : ''}`,
      icon: '👀',
      metadata,
    },
  }
}

/** The referrer, but only when it's another site. */
export function referrerForFirstView(referrer: string, currentOrigin: string): string | undefined {
  if (!referrer) return undefined
  try {
    return new URL(referrer).origin === currentOrigin ? undefined : referrer
  } catch {
    return undefined
  }
}

let stop: (() => void) | null = null

export function startPageviews(send: SendPageview): void {
  if (stop) return

  let lastPath: string | null = null
  let first = true
  let waitingForVisible = false

  // Builds and sends one pageview for a captured href. Never throws: a
  // malformed URL, anything — must never escape into the host app.
  const buildAndSend = (href: string) => {
    try {
      const referrer = first ? referrerForFirstView(document.referrer, window.location.origin) : undefined
      first = false
      const { title, fields } = pageviewEvent(href, document.title, referrer)
      send(title, fields)
    } catch {
      // Swallow: see the comment above.
    }
  }

  // The visibility check and the pathname dedupe always run synchronously,
  // at call time — so that two history mutations made back-to-back in the
  // same tick (e.g. pushState immediately followed by history.back()) are
  // each still seen as their own path change, rather than only the final
  // location. When `deferred` is set, only the build-and-send step — which
  // reads document.title — waits for a fresh task, because SPA routers
  // commonly call pushState/replaceState/dispatch popstate before updating
  // the title, and reading it synchronously would report the previous page's
  // title.
  const capture = (deferred: boolean) => {
    try {
      if (document.visibilityState !== 'visible') {
        if (!waitingForVisible) {
          waitingForVisible = true
          document.addEventListener('visibilitychange', onVisible)
        }
        return
      }
      const path = window.location.pathname
      if (path === lastPath) return
      lastPath = path
      const href = window.location.href
      if (deferred) setTimeout(() => buildAndSend(href), 0)
      else buildAndSend(href)
    } catch {
      // Swallow: see the comment on buildAndSend().
    }
  }

  const record = () => capture(false)
  const deferredRecord = () => capture(true)

  function onVisible() {
    try {
      if (document.visibilityState !== 'visible') return
      document.removeEventListener('visibilitychange', onVisible)
      waitingForVisible = false
      record()
    } catch {
      // Swallow: see the comment on buildAndSend().
    }
  }

  const originalPush = window.history.pushState
  const originalReplace = window.history.replaceState
  window.history.pushState = function (...args: Parameters<History['pushState']>) {
    originalPush.apply(this, args)
    deferredRecord()
  }
  window.history.replaceState = function (...args: Parameters<History['replaceState']>) {
    originalReplace.apply(this, args)
    deferredRecord()
  }
  window.addEventListener('popstate', deferredRecord)

  stop = () => {
    window.history.pushState = originalPush
    window.history.replaceState = originalReplace
    window.removeEventListener('popstate', deferredRecord)
    document.removeEventListener('visibilitychange', onVisible)
    stop = null
  }

  record()
}

export function stopPageviews(): void {
  stop?.()
}
