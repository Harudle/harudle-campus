// 배포 전 검사: 하나라도 실패하면 배포하지 않는다 (서버 감독이 새 커밋마다 돌린다)
//   1. 서버 코드 문법
//   2. 빌드 결과(dist)가 지금 소스로 만든 것인지 (npm run build를 빼먹지 않았는지)
//   3. 빌드된 페이지 스크립트 문법
//   4. 층 배치: 엘리베이터에서 모든 방·문·계단에 걸어서 닿는지, 닫힌 방엔 못 들어가는지, 어디서든 빠져나올 수 있는지
// 서버에는 개발 도구가 없으므로 node만으로 돈다.
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { inputHash } from './inputs.mjs'

let bad = 0
const fail = (...m) => { bad++; console.log('✗', ...m) }
const ok = (m) => console.log('✓', m)

for (const f of ['server.js', 'app.js', 'weather.js']) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); ok(`${f} 문법`) } catch (e) { fail(f, e.stderr?.toString()) }
}
for (const [file, name] of [['scripts/weather.test.mjs', '날씨 갱신과 실패 처리'], ['scripts/solar.test.mjs', '판교의 해와 시간 변화']]) {
  try { execFileSync(process.execPath, ['--test', file], { stdio: 'pipe' }); ok(name) }
  catch (e) { fail(name, (e.stdout || e.stderr)?.toString()) }
}

if (!existsSync('dist/index.html') || !existsSync('dist-check/world.mjs')) fail('dist가 없어요 — npm run build 후 커밋하세요')
else {
  const info = JSON.parse(readFileSync('dist-check/build-info.json', 'utf8'))
  const now = inputHash('.')
  if (info.hash !== now) fail(`dist가 소스와 달라요 (빌드 ${info.hash}, 소스 ${now}) — npm run build 후 커밋하세요`)
  else ok('dist가 소스와 일치')
  const dir = mkdtempSync(join(tmpdir(), 'wm-js-'))
  for (const f of readdirSync('dist/assets').filter((n) => n.endsWith('.js'))) {
    const copy = join(dir, f.replace(/\.js$/, '.mjs')); copyFileSync(join('dist/assets', f), copy)
    try { execFileSync(process.execPath, ['--check', copy], { stdio: 'pipe' }) } catch (e) { fail('page script', f, e.stderr?.toString().slice(0, 600)) }
  }
  rmSync(dir, { recursive: true, force: true })
  if (!bad) ok('페이지 스크립트 문법')

  const M = await import(pathToFileURL(resolve('dist-check/world.mjs')).href)
  const { W, H, FLOORS, solid, inRect, fits, nearestFree, ELEV_SPAWN } = M
  for (const f of [11, 12, 13, 14]) {
    const fl = FLOORS[f], R = fl.reach, reach = (x, y) => R[Math.floor(y) * W + Math.floor(x)] === 1
    const before = bad
    if (!fits(fl, ...ELEV_SPAWN) || !reach(...ELEV_SPAWN)) fail(f, '엘리베이터 도착 자리')
    for (const c of fl.calls) { let any = false; for (let x = c.x; x < c.x + c.w; x++) if (reach(x, c.y)) any = true; if (!any) fail(f, '엘리베이터 호출 자리에 못 감', c.x) }
    for (const p of fl.portals) {
      let any = false; for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) if (reach(x, y)) any = true; if (!any) fail(f, '계단에 못 감', p.label)
      const t = FLOORS[p.to]; if (!fits(t, ...p.spawn) || !t.reach[Math.floor(p.spawn[1]) * W + Math.floor(p.spawn[0])]) fail(f, '계단 도착 자리', p.label)
      if (t.portals.some((q) => inRect(q, ...p.spawn))) fail(f, '계단 도착 자리가 다른 계단 위', p.label)
    }
    for (const r of fl.rooms) {
      if (r.closed) { for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) if (reach(x, y)) fail(f, '닫힌 방에 들어가짐', r.name); continue }
      let n = 0; for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) if (!solid(fl, x, y) && reach(x, y)) n++
      if (!n) fail(f, '방에 못 들어감', r.name || '(출입구)')
      for (const d of r.doors || []) for (let i = d.from; i < d.from + d.len; i++) { const [x, y] = d.s === 'n' ? [r.x + i, r.y] : d.s === 's' ? [r.x + i, r.y + r.h - 1] : d.s === 'w' ? [r.x, r.y + i] : [r.x + r.w - 1, r.y + i]; if (!reach(x, y)) fail(f, '문이 막힘', r.name, d.s) }
    }
    for (let i = 0; i < 1500; i++) { const x = Math.random() * W, y = Math.random() * H, p = nearestFree(fl, x, y); if (!fits(fl, ...p) || !reach(...p)) { fail(f, '끼임 탈출 실패', x.toFixed(1), y.toFixed(1)); break } }
    if (bad === before) ok(`${f}층 배치`)
  }
}

if (bad) { console.log(`\n문제 ${bad}개 — 배포하지 않아요`); process.exit(1) }
console.log('\n모두 통과')
