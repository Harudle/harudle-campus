// npm run build 마지막 단계: 층 검사용 모듈과 14층 월드 서버를 따로 묶고, 빌드 지문을 남긴다
import { build } from 'esbuild'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { inputHash } from './inputs.mjs'

await build({ entryPoints: ['src/engine/world.ts'], bundle: true, format: 'esm', platform: 'neutral', outfile: 'dist-check/world.mjs', logLevel: 'warning' })
const sunCalcLicense = readFileSync('static/licenses/suncalc.txt', 'utf8').replace(/\*\//g, '* /')
await build({ entryPoints: ['src/engine/solar.ts'], bundle: true, format: 'esm', platform: 'neutral', outfile: 'dist-check/solar.mjs', logLevel: 'warning', banner: { js: `/*\n${sunCalcLicense}\n*/` } })
// 14층 하루들 월드 서버: 서버에는 빌드 도구가 없으므로 JS 한 파일로 묶어 함께 올린다
rmSync('dist-server', { recursive: true, force: true })
await build({ entryPoints: ['world/server/campus.ts'], bundle: true, format: 'esm', platform: 'node', target: 'node22', packages: 'external', outfile: 'dist-server/world.mjs', logLevel: 'warning' })
const info = { hash: inputHash(), builtAt: new Date().toISOString() }
mkdirSync('dist', { recursive: true })
for (const f of ['dist/build-info.json', 'dist-check/build-info.json']) writeFileSync(f, JSON.stringify(info, null, 2) + '\n')
console.log('build-info', info.hash)
