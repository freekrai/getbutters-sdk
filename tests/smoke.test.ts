import { expect, test } from 'bun:test'

test('the test environment has a browser-like window', () => {
  expect(typeof window).toBe('object')
  expect(window.location.origin).toBe('https://example.com')
  expect(typeof window.localStorage.setItem).toBe('function')
})
