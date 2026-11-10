// 빌드 입력 지문: 이 파일들이 바뀌면 dist를 다시 만들어야 한다 (build-info와 배포 전 검사가 같은 규칙을 쓴다)
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const INPUTS = ['index.html', 'src', 'static', 'world', 'vite.config.ts', 'tsconfig.json', 'package-lock.json']

function walk(p, out) {
  if (!existsSync(p)) return
  if (statSync(p).isDirectory()) for (const n of readdirSync(p).sort()) walk(join(p, n), out)
  else out.push(p)
}

export function inputHash(root = '.') {
  const files = []
  for (const p of INPUTS) walk(join(root, p), files)
  const h = createHash('sha256')
  for (const f of files) { h.update(f.slice(root.length)); h.update('\0'); h.update(readFileSync(f).toString().replace(/\r\n/g, '\n')); h.update('\0') }
  return h.digest('hex').slice(0, 16)
}
