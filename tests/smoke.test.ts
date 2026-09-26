import { expect, test } from 'bun:test'
import { VERSION } from '../src/index'

test('the test environment has a browser-like window', () => {
  expect(typeof window).toBe('object')
  expect(window.location.href).toBe('https://example.com/')
  expect(typeof window.localStorage.setItem).toBe('function')
})

test('the package exports its version', () => {
  expect(VERSION).toBe('0.1.0')
})
