import { startPageviews, stopPageviews } from './pageviews'
import { clearUserId, forgetMemoryForTests, readUserId, writeUserId } from './storage'
import { postJson } from './transport'

export interface InitOptions {
  /** A publishable key (`pk_…`) from the API page. */
  key: string
  /** Defaults to https://app.getbutters.com. */
  host?: string
  /** Send a `pageview` event on load and on client-side navigation. Off by default. */
  pageviews?: boolean
  /** Log failures with console.warn. */
  debug?: boolean
}

export interface TrackFields {
  description?: string
  icon?: string
  tags?: Record<string, string>
  metadata?: unknown
  url?: string
}

const DEFAULT_HOST = 'https://app.getbutters.com'
const USER_ID_MAX_CODE_POINTS = 200

interface Config {
  key: string
  host: string
  debug: boolean
}

let config: Config | null = null

const inBrowser = (): boolean => typeof window !== 'undefined'

function warn(message: string): void {
  if (config?.debug) console.warn(`[butters] ${message}`)
}

export function init(options: InitOptions): void {
  if (!inBrowser()) return
  if (config) {
    warn('init() was called more than once; ignoring the later call')
    return
  }
  if (!options?.key) return

  config = {
    key: options.key,
    host: (typeof options.host === 'string' && options.host !== '' ? options.host : DEFAULT_HOST).replace(/\/+$/, ''),
    debug: options.debug === true,
  }

  if (options.pageviews) startPageviews((title, fields) => track('pageview', title, fields))
}

export async function track(category: string, title: string, fields: TrackFields = {}): Promise<void> {
  if (!inBrowser() || !config) return
  const userId = readUserId()
  await postJson({
    host: config.host,
    key: config.key,
    path: '/api/events',
    body: { category, title, ...fields, ...(userId ? { user_id: userId } : {}) },
    debug: config.debug,
  })
}

export async function identify(userId: string, properties?: Record<string, unknown>): Promise<void> {
  if (!inBrowser() || !config) return
  if (typeof userId !== 'string' || userId === '') {
    warn('identify() needs a non-empty string id')
    return
  }
  if ([...userId].length > USER_ID_MAX_CODE_POINTS) {
    warn(`identify() ids must be ${USER_ID_MAX_CODE_POINTS} characters or fewer`)
    return
  }
  writeUserId(userId)
  await postJson({
    host: config.host,
    key: config.key,
    path: '/api/identify',
    body: properties ? { user_id: userId, properties } : { user_id: userId },
    debug: config.debug,
  })
}

/** Forget the identified user, e.g. on logout. */
export function reset(): void {
  if (!inBrowser()) return
  clearUserId()
}

/** Test helper: back to a never-initialised state. Not part of the public API. */
export function _resetForTests(options: { keepStorage?: boolean } = {}): void {
  config = null
  stopPageviews()
  if (options.keepStorage) forgetMemoryForTests()
  else clearUserId()
}
