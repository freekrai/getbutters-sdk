import { rmSync } from 'node:fs'

rmSync('dist', { recursive: true, force: true })

const esm = await Bun.build({
  entrypoints: ['src/index.ts'],
  outdir: 'dist',
  format: 'esm',
  target: 'browser',
})
if (!esm.success) throw new AggregateError(esm.logs, 'ESM build failed')

const iife = await Bun.build({
  entrypoints: ['src/iife.ts'],
  outdir: 'dist',
  naming: 'butters.min.js',
  format: 'iife',
  target: 'browser',
  minify: true,
})
if (!iife.success) throw new AggregateError(iife.logs, 'IIFE build failed')

// Declarations only; bun build doesn't emit them. TypeScript 7's tsc refuses
// to mix a tsconfig.json in the cwd with files on the command line, so the
// declaration-only options live in tsconfig.build.json instead.
const tsc = Bun.spawnSync(['bunx', 'tsc', '-p', 'tsconfig.build.json'], { stdout: 'inherit', stderr: 'inherit' })
if (tsc.exitCode !== 0) throw new Error('Declaration build failed')
