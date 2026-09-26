const STORAGE_KEY = 'butters_uid'

/**
 * The identified user, for this page's lifetime at least. `localStorage` can
 * throw (Safari private mode, blocked site data), so every access is guarded
 * and memory backs it up.
 */
let memory: string | null = null

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readUserId(): string | null {
  try {
    const stored = storage()?.getItem(STORAGE_KEY)
    if (stored) return stored
  } catch {
    // Fall through to memory.
  }
  return memory
}

export function writeUserId(id: string): void {
  memory = id
  try {
    storage()?.setItem(STORAGE_KEY, id)
  } catch {
    // Memory still holds it.
  }
}

export function clearUserId(): void {
  memory = null
  try {
    storage()?.removeItem(STORAGE_KEY)
  } catch {
    // Nothing else to clear.
  }
}
