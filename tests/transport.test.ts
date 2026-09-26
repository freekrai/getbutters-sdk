import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test'
import { postJson } from '../src/transport'

let calls: Array<{ url: string; init: RequestInit }> = []
let respond: () => Promise<Response> = async () => new Response(null, { status: 201 })

beforeEach(() => {
  calls = []
  respond = async () => new Response(null, { status: 201 })
  globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return respond()
  }) as unknown as typeof fetch
})

afterEach(() => {
  mock.restore()
})

const base = { host: 'https://app.getbutters.com', key: 'pk_test', path: '/api/events', debug: false }

describe('postJson', () => {
  test('POSTs JSON with the bearer key and keepalive', async () => {
    await postJson({ ...base, body: { category: 'c', title: 't' } })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://app.getbutters.com/api/events')
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.keepalive).toBe(true)
    const headers = new Headers(calls[0].init.headers)
    expect(headers.get('Authorization')).toBe('Bearer pk_test')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ category: 'c', title: 't' })
  })

  test('resolves on a network error and warns only in debug', async () => {
    respond = async () => {
      throw new TypeError('network down')
    }
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    await expect(postJson({ ...base, body: {} })).resolves.toBeUndefined()
    expect(warn).not.toHaveBeenCalled()
    await postJson({ ...base, body: {}, debug: true })
    expect(warn).toHaveBeenCalledTimes(1)
  })

  test('resolves on a non-2xx status and warns only in debug', async () => {
    respond = async () => new Response('{"error":"Rate limit exceeded"}', { status: 429 })
    const warn = spyOn(console, 'warn').mockImplementation(() => {})
    await expect(postJson({ ...base, body: {} })).resolves.toBeUndefined()
    expect(warn).not.toHaveBeenCalled()
    await postJson({ ...base, body: {}, debug: true })
    expect(String(warn.mock.calls[0][0])).toContain('429')
  })

  test('an unserializable body resolves and sends nothing', async () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    await expect(postJson({ ...base, body: { metadata: circular } })).resolves.toBeUndefined()
    await expect(postJson({ ...base, body: { n: 1n } })).resolves.toBeUndefined()
    expect(calls).toHaveLength(0)
  })
})
