import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { _resetForTests, identify, init, reset, track } from '../src/index'

let calls: Array<{ url: string; body: any; headers: Headers }> = []

beforeEach(() => {
  _resetForTests()
  calls = []
  globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) })
    return new Response(null, { status: 201 })
  }) as unknown as typeof fetch
})

afterEach(() => {
  mock.restore()
  _resetForTests()
})

describe('before init', () => {
  test('track, identify and reset are silent no-ops', async () => {
    await expect(track('c', 't')).resolves.toBeUndefined()
    await expect(identify('u_1')).resolves.toBeUndefined()
    expect(() => reset()).not.toThrow()
    expect(calls).toHaveLength(0)
  })
})

describe('init', () => {
  test('defaults the host and uses the key', async () => {
    init({ key: 'pk_a' })
    await track('signup', 'New signup')
    expect(calls[0].url).toBe('https://app.getbutters.com/api/events')
    expect(calls[0].headers.get('Authorization')).toBe('Bearer pk_a')
  })

  test('accepts a custom host and trims trailing slashes', async () => {
    init({ key: 'pk_a', host: 'http://localhost:3000//' })
    await track('c', 't')
    expect(calls[0].url).toBe('http://localhost:3000/api/events')
  })

  test('a second init is ignored and warns in debug', async () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    init({ key: 'pk_first', debug: true })
    init({ key: 'pk_second', debug: true })
    await track('c', 't')
    expect(calls[0].headers.get('Authorization')).toBe('Bearer pk_first')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  test('init without a key is ignored', async () => {
    init({ key: '' })
    await track('c', 't')
    expect(calls).toHaveLength(0)
  })

  test('a non-string host falls back to the default instead of throwing', async () => {
    expect(() => init({ key: 'pk_a', host: 42 as unknown as string })).not.toThrow()
    await track('c', 't')
    expect(calls[0].url).toBe('https://app.getbutters.com/api/events')
  })
})

describe('track', () => {
  test('sends category, title and fields, without user_id before identify', async () => {
    init({ key: 'pk_a' })
    await track('orders', 'Order placed', {
      description: 'Order **#1**',
      icon: '🛍',
      tags: { plan: 'pro' },
      metadata: { total: 12 },
      url: 'https://example.com/orders/1',
    })
    expect(calls[0].body).toEqual({
      category: 'orders',
      title: 'Order placed',
      description: 'Order **#1**',
      icon: '🛍',
      tags: { plan: 'pro' },
      metadata: { total: 12 },
      url: 'https://example.com/orders/1',
    })
  })

  test('adds user_id after identify, and not after reset', async () => {
    init({ key: 'pk_a' })
    await identify('u_42', { plan: 'pro' })
    await track('c', 'after identify')
    reset()
    await track('c', 'after reset')

    expect(calls[0].url).toBe('https://app.getbutters.com/api/identify')
    expect(calls[0].body).toEqual({ user_id: 'u_42', properties: { plan: 'pro' } })
    expect(calls[1].body.user_id).toBe('u_42')
    expect(calls[2].body.user_id).toBeUndefined()
  })

  test('user_id survives a reload via localStorage', async () => {
    init({ key: 'pk_a' })
    await identify('u_7')
    _resetForTests({ keepStorage: true })
    init({ key: 'pk_a' })
    await track('c', 't')
    expect(calls.at(-1)!.body.user_id).toBe('u_7')
  })
})

describe('identify', () => {
  test('omits properties when none are given', async () => {
    init({ key: 'pk_a' })
    await identify('u_1')
    expect(calls[0].body).toEqual({ user_id: 'u_1' })
  })

  test('an empty or non-string id is ignored', async () => {
    init({ key: 'pk_a' })
    await identify('')
    await identify(42 as unknown as string)
    expect(calls).toHaveLength(0)
  })
})
