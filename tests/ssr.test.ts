import { expect, test } from 'bun:test'

test('every function is a no-op without window (SSR)', () => {
  const script = `
    const m = await import('${import.meta.dir}/../src/index.ts')
    globalThis.fetch = () => { throw new Error('fetch must not be called') }
    m.init({ key: 'pk_a', pageviews: true })
    await m.track('c', 't')
    await m.identify('u')
    m.reset()
    console.log(typeof window, 'ok')
  `
  const result = Bun.spawnSync(['bun', '-e', script], { stderr: 'pipe', stdout: 'pipe' })
  expect(result.stderr.toString()).toBe('')
  expect(result.stdout.toString().trim()).toBe('undefined ok')
})
