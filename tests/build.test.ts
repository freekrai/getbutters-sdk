import { beforeAll, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'

const root = `${import.meta.dir}/..`

beforeAll(() => {
  const result = Bun.spawnSync(['bun', 'run', 'build'], { cwd: root, stderr: 'pipe', stdout: 'pipe' })
  if (result.exitCode !== 0) throw new Error(result.stderr.toString())
}, 60_000)

describe('build output', () => {
  test('ESM entry and declarations exist', () => {
    expect(existsSync(`${root}/dist/index.js`)).toBe(true)
    expect(existsSync(`${root}/dist/index.d.ts`)).toBe(true)
    expect(readFileSync(`${root}/dist/index.d.ts`, 'utf8')).toContain('export declare function track')
  })

  test('the ESM build exports the API', async () => {
    const mod = await import(`${root}/dist/index.js`)
    expect(typeof mod.init).toBe('function')
    expect(typeof mod.track).toBe('function')
    expect(typeof mod.identify).toBe('function')
    expect(typeof mod.reset).toBe('function')
  })

  test('the IIFE defines window.butters and has no import/export', () => {
    const code = readFileSync(`${root}/dist/butters.min.js`, 'utf8')
    expect(code).not.toMatch(/^\s*(import|export)\s/m)
    // Evaluate in this happy-dom window.
    ;(window as any).butters = undefined
    new Function(code)()
    const api = (window as any).butters
    expect(typeof api.init).toBe('function')
    expect(typeof api.track).toBe('function')
    expect(typeof api.identify).toBe('function')
    expect(typeof api.reset).toBe('function')
  })

  test('the IIFE stays small', () => {
    expect(readFileSync(`${root}/dist/butters.min.js`).byteLength).toBeLessThan(6 * 1024)
  })
})
