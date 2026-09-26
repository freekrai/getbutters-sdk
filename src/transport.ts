export interface PostOptions {
  host: string
  key: string
  path: string
  body: unknown
  debug: boolean
}

// Browsers reject a `keepalive: true` request whose body exceeds 64 KiB,
// dropping it silently instead of sending it. Stay comfortably under that so
// a large event still reaches the server, just without the keepalive
// guarantee for requests made right before navigation.
const KEEPALIVE_BODY_LIMIT_BYTES = 60_000

/**
 * One fire-and-forget JSON POST. Never throws and never rejects: analytics
 * must not be able to break the page that loads it. `keepalive` lets a
 * request made just before navigation finish, but only for small bodies —
 * see `KEEPALIVE_BODY_LIMIT_BYTES`.
 */
export async function postJson({ host, key, path, body, debug }: PostOptions): Promise<void> {
  try {
    const serializedBody = JSON.stringify(body)
    const byteLength = new TextEncoder().encode(serializedBody).length
    const response = await fetch(`${host}${path}`, {
      method: 'POST',
      keepalive: byteLength < KEEPALIVE_BODY_LIMIT_BYTES,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: serializedBody,
    })
    if (!response.ok && debug) console.warn(`[butters] ${path} failed with ${response.status}`)
  } catch (error) {
    if (debug) console.warn(`[butters] ${path} failed:`, error)
  }
}
