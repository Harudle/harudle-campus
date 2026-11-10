import * as THREE from 'three'

/** 윗변이 구름처럼 볼록볼록한 종이 벽 실루엣. 밑변 중앙이 원점이다. */
export function scallopedWall(width: number, height: number, bumps: number) {
  const shape = new THREE.Shape()
  const half = width / 2
  const radius = width / bumps / 2
  shape.moveTo(-half, 0)
  shape.lineTo(-half, height)
  for (let i = 0; i < bumps; i++) {
    shape.absarc(-half + radius * (2 * i + 1), height, radius, Math.PI, 0, true)
  }
  shape.lineTo(half, 0)
  shape.closePath()
  return shape
}

export function star(outer: number, inner: number, points = 5) {
  const shape = new THREE.Shape()
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner
    const angle = Math.PI / 2 + (i * Math.PI) / points
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  return shape
}

export function cloud(scale = 1) {
  const shape = new THREE.Shape()
  shape.moveTo(-1.2 * scale, 0)
  shape.absarc(-0.8 * scale, 0.25 * scale, 0.45 * scale, Math.PI * 1.1, Math.PI * 0.35, true)
  shape.absarc(0, 0.5 * scale, 0.65 * scale, Math.PI * 0.9, Math.PI * 0.15, true)
  shape.absarc(0.8 * scale, 0.25 * scale, 0.45 * scale, Math.PI * 0.65, -Math.PI * 0.1, true)
  shape.closePath()
  return shape
}

/** 꼬리가 아래로 난 말풍선. 꼬리 끝이 원점 근처, 몸통 중심은 (0, tail + height / 2) */
export function speechBubble(width: number, height: number, tail: number) {
  const w = width / 2
  const r = Math.min(height / 2, 0.42)
  const shape = new THREE.Shape()
  shape.moveTo(-w + r, tail)
  shape.lineTo(-0.18, tail)
  shape.lineTo(-0.28, 0)
  shape.lineTo(0.28, tail)
  shape.lineTo(w - r, tail)
  shape.quadraticCurveTo(w, tail, w, tail + r)
  shape.lineTo(w, tail + height - r)
  shape.quadraticCurveTo(w, tail + height, w - r, tail + height)
  shape.lineTo(-w + r, tail + height)
  shape.quadraticCurveTo(-w, tail + height, -w, tail + height - r)
  shape.lineTo(-w, tail + r)
  shape.quadraticCurveTo(-w, tail, -w + r, tail)
  return shape
}
