// npm run build 마지막 단계: 층 검사용 모듈을 따로 묶고, 빌드 지문을 남긴다
import { build } from 'esbuild'
import { writeFileSync, mkdirSync } from 'node:fs'
import { inputHash } from './inputs.mjs'

await build({ entryPoints: ['src/engine/world.ts'], bundle: true, format: 'esm', platform: 'neutral', outfile: 'dist-check/world.mjs', logLevel: 'warning' })
const info = { hash: inputHash(), builtAt: new Date().toISOString() }
mkdirSync('dist', { recursive: true })
for (const f of ['dist/build-info.json', 'dist-check/build-info.json']) writeFileSync(f, JSON.stringify(info, null, 2) + '\n')
console.log('build-info', info.hash)
