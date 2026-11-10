import type * as THREE from 'three'

/**
 * Three.js 레이캐스트는 visible을 보지 않아서, 숨긴 벽의 문이나 액자도 클릭을 가로챈다.
 * 핸들러 첫머리에서 이 값이 false면 stopPropagation 없이 돌아가 뒤쪽 바닥으로 넘긴다.
 */
export function isShown(object: THREE.Object3D) {
  for (let current: THREE.Object3D | null = object; current; current = current.parent) {
    if (!current.visible) return false
  }
  return true
}
