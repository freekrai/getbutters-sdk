import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, before, test } from 'node:test'
import { Butters, ButtersError } from '@getbutters/js/server'

let server
let host
const requests = []

before(async () => {
  server = createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw)
    requests.push({ path: req.url, method: req.method, authorization: req.headers.authorization, body })
    if (body.title === 'timeout') return
    if (body.title === 'redirect') {
      res.writeHead(307, { Location: '/stolen' }).end()
      return
    }
    if (body.title === 'invalid-json') {
      res.writeHead(200).end('not JSON')
      return
    }
    if (body.title === 'non-json-error') {
      res.writeHead(502).end('Bad Gateway')
      return
    }
    res.setHeader('Content-Type', 'application/json')
    if (body.title === 'rate-limit') {
      res.writeHead(429, { 'Retry-After': '60' }).end(JSON.stringify({ error: 'Too many requests' }))
      return
    }
    if (req.url === '/api/events') {
      res.writeHead(201).end(
        JSON.stringify({
          id: requests.length,
          projectId: body.project,
          ...body,
          user_id: body.user_id ?? null,
        }),
      )
    } else res.end(JSON.stringify({ ok: true }))
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  host = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
})

test('track uses the secret/project and preserves server fields', async () => {
  const client = new Butters({ key: 'ev_test', project: 'project-a', host: `${host}/` })
  const result = await client.track('billing', 'Paid', {
    user_id: 'alice',
    notify: true,
    created_at: 1234,
    metadata: { amount: 5 },
    tags: { plan: 'pro' },
  })
  assert.equal(result.title, 'Paid')
  assert.equal(result.projectId, 'project-a')
  assert.deepEqual(requests.at(-1), {
    path: '/api/events',
    method: 'POST',
    authorization: 'Bearer ev_test',
    body: {
      category: 'billing',
      title: 'Paid',
      project: 'project-a',
      user_id: 'alice',
      notify: true,
      created_at: 1234,
      metadata: { amount: 5 },
      tags: { plan: 'pro' },
    },
  })
})

test('concurrent users and separate clients do not share identity or credentials', async () => {
  const a = new Butters({ key: 'ev_a', project: 'a', host })
  const b = new Butters({ key: 'ev_b', project: 'b', host })
  await a.identify('alice', { plan: 'pro' })
  assert.deepEqual(requests.at(-1).body, { user_id: 'alice', properties: { plan: 'pro' }, project: 'a' })
  const results = await Promise.all([
    a.track('test', 'Alice', { user_id: 'alice' }),
    a.track('test', 'Bob', { user_id: 'bob' }),
    b.track('test', 'Anonymous'),
    a.track('test', 'No implicit identity'),
  ])
  assert.deepEqual(
    results.map((r) => r.user_id),
    ['alice', 'bob', null, null],
  )
  assert.equal(requests.find((r) => r.body.title === 'Anonymous').authorization, 'Bearer ev_b')
})

test('insights use POST for sets and PATCH for increments, including negative/zero', async () => {
  const client = new Butters({ key: 'ev_test', project: 'a', host })
  assert.deepEqual(await client.setInsight('Queue', 0, '📈'), { ok: true })
  assert.equal(requests.at(-1).method, 'POST')
  assert.deepEqual(requests.at(-1).body, { title: 'Queue', value: 0, icon: '📈', project: 'a' })
  await client.incrementInsight('Queue', -1)
  assert.equal(requests.at(-1).method, 'PATCH')
  assert.deepEqual(requests.at(-1).body, { title: 'Queue', $inc: -1, project: 'a' })
  await client.incrementInsight('Queue', 0)
  assert.equal(requests.at(-1).body.$inc, 0)
  const count = requests.length
  await assert.rejects(client.incrementInsight('Queue', Infinity), TypeError)
  assert.equal(requests.length, count)
})

test('HTTP errors expose status and retry guidance and writes are never retried', async () => {
  const client = new Butters({ key: 'ev_test', project: 'a', host })
  const count = requests.length
  await assert.rejects(client.track('test', 'rate-limit'), (error) => {
    assert.ok(error instanceof ButtersError)
    assert.equal(error.status, 429)
    assert.equal(error.message, 'Too many requests')
    assert.equal(error.retryAfter, '60')
    return true
  })
  assert.equal(requests.length, count + 1)
  await assert.rejects(client.track('test', 'non-json-error'), (error) => error.status === 502)
  await assert.rejects(client.track('test', 'invalid-json'), /invalid JSON/)
})

test('redirects are not followed and requests time out', async () => {
  const client = new Butters({ key: 'ev_test', project: 'a', host, timeoutMs: 100 })
  await assert.rejects(client.track('test', 'redirect'))
  assert.equal(
    requests.some((r) => r.path === '/stolen'),
    false,
  )
  await assert.rejects(client.track('test', 'timeout'), (error) => error.name === 'AbortError')
})

test('validates config and refuses browser execution', () => {
  const base = { key: 'ev_test', project: 'a', host }
  for (const options of [
    { ...base, key: 'pk_test' },
    { ...base, project: '' },
    { ...base, host: 'ftp://example.com' },
    { ...base, host: 'https://user:pass@example.com' },
    { ...base, timeoutMs: 0 },
    { ...base, timeoutMs: NaN },
  ])
    assert.throws(() => new Butters(options), TypeError)
  globalThis.window = {}
  try {
    assert.throws(() => new Butters(base), /only in server code/)
  } finally {
    delete globalThis.window
  }
})
