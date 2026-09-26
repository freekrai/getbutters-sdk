import { afterEach, describe, expect, test } from 'bun:test'
import { clearUserId, readUserId, writeUserId } from '../src/storage'

const realStorage = Object.getOwnPropertyDescriptor(window, 'localStorage')!

afterEach(() => {
  Object.defineProperty(window, 'localStorage', realStorage)
  clearUserId()
})

describe('user id storage', () => {
  test('round-trips through localStorage under butters_uid', () => {
    writeUserId('u_1')
    expect(window.localStorage.getItem('butters_uid')).toBe('u_1')
    expect(readUserId()).toBe('u_1')
  })

  test('clear removes it', () => {
    writeUserId('u_1')
    clearUserId()
    expect(readUserId()).toBeNull()
    expect(window.localStorage.getItem('butters_uid')).toBeNull()
  })

  test('falls back to memory when localStorage throws', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError')
      },
    })
    expect(() => writeUserId('u_2')).not.toThrow()
    expect(readUserId()).toBe('u_2')
    clearUserId()
    expect(readUserId()).toBeNull()
  })
})
