import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { _resetForTests, init } from '../src/index'
import { pageviewEvent, referrerForFirstView } from '../src/pageviews'

describe('pageviewEvent', () => {
  test('title is the pathname; url keeps only utm_* and drops the hash', () => {
    const { title, fields } = pageviewEvent(
      'https://example.com/reset?token=abc&utm_source=news&utm_medium=email#frag',
      'Reset – Example',
      undefined,
    )
    expect(title).toBe('/reset')
    expect(fields.url).toBe('https://example.com/reset?utm_source=news&utm_medium=email')
    expect(fields.icon).toBe('👀')
    expect(fields.metadata).toEqual({
      page_title: 'Reset – Example',
      utm: { source: 'news', medium: 'email' },
    })
  })

  test('no query at all leaves a clean url and no utm key', () => {
    const { fields } = pageviewEvent('https://example.com/pricing', 'Pricing', undefined)
    expect(fields.url).toBe('https://example.com/pricing')
    expect(fields.metadata).toEqual({ page_title: 'Pricing' })
  })

  test('page_title is capped at 200 characters and omitted when empty', () => {
    const long = pageviewEvent('https://example.com/', 'x'.repeat(250), undefined)
    expect((long.fields.metadata as any).page_title).toHaveLength(200)
    const empty = pageviewEvent('https://example.com/', '', undefined)
    expect(empty.fields.metadata).toEqual({})
  })

  test('referrer is included when given', () => {
    const { fields } = pageviewEvent('https://example.com/', 'Home', 'https://news.ycombinator.com/')
    expect((fields.metadata as any).referrer).toBe('https://news.ycombinator.com/')
  })
})

describe('referrerForFirstView', () => {
  test('keeps another origin, drops same-origin, empty and junk', () => {
    expect(referrerForFirstView('https://news.ycombinator.com/item', 'https://example.com')).toBe(
      'https://news.ycombinator.com/item',
    )
    expect(referrerForFirstView('https://example.com/pricing', 'https://example.com')).toBeUndefined()
    expect(referrerForFirstView('', 'https://example.com')).toBeUndefined()
    expect(referrerForFirstView('not a url', 'https://example.com')).toBeUndefined()
  })
})

/**
 * happy-dom's `document` doesn't get `visibilityState` from the globally
 * exposed `Document.prototype` — it's on an internal prototype object
 * earlier in `document`'s own chain. Walk the chain to find whichever
 * object actually owns the property, so overriding it is reflected by a
 * plain `document.visibilityState` read.
 */
function findVisibilityStateOwner(): object | null {
  let proto = Object.getPrototypeOf(document)
  while (proto) {
    if (Object.getOwnPropertyDescriptor(proto, 'visibilityState')) return proto
    proto = Object.getPrototypeOf(proto)
  }
  return null
}

function setVisibilityState(value: 'visible' | 'hidden'): void {
  const owner = findVisibilityStateOwner()
  if (!owner) throw new Error('could not find the object that owns visibilityState')
  Object.defineProperty(owner, 'visibilityState', { configurable: true, get: () => value })
}

describe('pageview tracking via init({ pageviews: true })', () => {
  let bodies: any[] = []
  const visibilityOwner = findVisibilityStateOwner()
  const realVisibility = visibilityOwner
    ? Object.getOwnPropertyDescriptor(visibilityOwner, 'visibilityState')
    : undefined

  beforeEach(() => {
    _resetForTests()
    bodies = []
    window.history.replaceState(null, '', '/')
    globalThis.fetch = mock(async (_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)))
      return new Response(null, { status: 201 })
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    if (visibilityOwner && realVisibility) Object.defineProperty(visibilityOwner, 'visibilityState', realVisibility)
    _resetForTests()
    mock.restore()
  })

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
  const titles = () => bodies.filter((b) => b.category === 'pageview').map((b) => b.title)

  test('off by default', async () => {
    init({ key: 'pk_a' })
    await flush()
    expect(titles()).toEqual([])
  })

  test('fires on load, pushState, replaceState and popstate when the path changes', async () => {
    init({ key: 'pk_a', pageviews: true })
    await flush()
    window.history.pushState(null, '', '/pricing')
    await flush()
    window.history.replaceState(null, '', '/signup')
    await flush()
    window.history.pushState(null, '', '/docs')
    window.history.back()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(titles()).toEqual(['/', '/pricing', '/signup', '/docs', '/signup'])
  })

  test('same pathname with a new query or hash is not a new pageview', async () => {
    init({ key: 'pk_a', pageviews: true })
    await flush()
    window.history.pushState(null, '', '/?tab=2')
    window.history.pushState(null, '', '/#section')
    await flush()
    expect(titles()).toEqual(['/'])
  })

  test('waits for a hidden tab to become visible, then fires once', async () => {
    setVisibilityState('hidden')
    init({ key: 'pk_a', pageviews: true })
    await flush()
    expect(titles()).toEqual([])

    setVisibilityState('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    document.dispatchEvent(new Event('visibilitychange'))
    await flush()
    expect(titles()).toEqual(['/'])
  })

  test('stop restores history and stops tracking', async () => {
    const originalPush = window.history.pushState
    init({ key: 'pk_a', pageviews: true })
    expect(window.history.pushState).not.toBe(originalPush)
    _resetForTests()
    expect(window.history.pushState).toBe(originalPush)
  })
})
