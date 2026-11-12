const STORAGE_KEY = 'butters_uid'
/** The server-signed `user_hash` for that user, when the key verifies identity. */
const HASH_KEY = 'butters_uid_hash'

/**
 * The identified user, for this page's lifetime at least. `localStorage` can
 * throw (Safari private mode, blocked site data), so every access is guarded
 * and memory backs it up.
 */
let memory: string | null = null
let memoryHash: string | null = null

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readUserId(): string | null {
  const s = storage()
  // The memory fallback is only for when storage is unavailable (blocked,
  // threw) — not when it works but simply has no value, since another tab
  // may have logged out and cleared it deliberately.
  if (s === null) return memory
  try {
    return s.getItem(STORAGE_KEY)
  } catch {
    return memory
  }
}

export function readUserHash(): string | null {
  const s = storage()
  if (s === null) return memoryHash
  try {
    return s.getItem(HASH_KEY)
  } catch {
    return memoryHash
  }
}

/** Store the user, and their hash or the absence of one, together. */
export function writeUserId(id: string, hash?: string): void {
  memory = id
  memoryHash = hash ?? null
  try {
    const s = storage()
    s?.setItem(STORAGE_KEY, id)
    if (hash) s?.setItem(HASH_KEY, hash)
    else s?.removeItem(HASH_KEY)
  } catch {
    // Memory still holds it.
  }
}

/** `user_id`, plus `user_hash` when one was given, for a request body. */
export function identityFields(): { user_id?: string; user_hash?: string } {
  const userId = readUserId()
  if (!userId) return {}
  const hash = readUserHash()
  return hash ? { user_id: userId, user_hash: hash } : { user_id: userId }
}

export function clearUserId(): void {
  memory = null
  memoryHash = null
  try {
    storage()?.removeItem(STORAGE_KEY)
    storage()?.removeItem(HASH_KEY)
  } catch {
    // Nothing else to clear.
  }
}

/** Test helper: drop the in-memory copy only, as a page reload would. */
export function forgetMemoryForTests(): void {
  memory = null
  memoryHash = null
}
