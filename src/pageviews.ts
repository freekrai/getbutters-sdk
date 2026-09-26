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
  const pageTitle = documentTitle.slice(0, PAGE_TITLE_MAX)
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

  const record = () => {
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

    const referrer = first ? referrerForFirstView(document.referrer, window.location.origin) : undefined
    first = false
    const { title, fields } = pageviewEvent(window.location.href, document.title, referrer)
    send(title, fields)
  }

  function onVisible() {
    if (document.visibilityState !== 'visible') return
    document.removeEventListener('visibilitychange', onVisible)
    waitingForVisible = false
    record()
  }

  const originalPush = window.history.pushState
  const originalReplace = window.history.replaceState
  window.history.pushState = function (...args: Parameters<History['pushState']>) {
    originalPush.apply(this, args)
    record()
  }
  window.history.replaceState = function (...args: Parameters<History['replaceState']>) {
    originalReplace.apply(this, args)
    record()
  }
  window.addEventListener('popstate', record)

  stop = () => {
    window.history.pushState = originalPush
    window.history.replaceState = originalReplace
    window.removeEventListener('popstate', record)
    document.removeEventListener('visibilitychange', onVisible)
    stop = null
  }

  record()
}

export function stopPageviews(): void {
  stop?.()
}
