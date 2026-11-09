import { useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { PaintMark } from '../../data/presence'
import { Skin } from '../Characters'

const PAINT_MS = 15_000
const POP_MS = 120
const FADE_MS = 1500
const FORWARD = new THREE.Vector3(0, 0, 1)
const HEAD_CENTER = new THREE.Vector3(0, 1.3, 0)
// 눈과 입을 피해 머리 표면에 차례로 묻는다. 모자에 가려지지 않도록 얼굴 아래쪽부터 쓴다.
const FACE_SPOTS: [number, number, number][] = [
  [0.22, 1.22, 0.25],
  [-0.24, 1.2, 0.22],
  [0, 1.04, 0.22],
  [0.3, 1.33, 0.15],
  [-0.3, 1.33, 0.15],
  [0, 1.33, 0.34],
]
// 어느 쪽에서 봐도 보이도록 한 번 칠할 때 얼굴과 뒤통수에 함께 묻는다.
const SPOTS = FACE_SPOTS.flatMap(([x, y, z]): [number, number, number][] => [[x, y, z], [-x, y, -z]])

/** 붓으로 칠해진 자국. 아바타 설정은 그대로 두고 잠깐 묻었다가 사라진다. */
export function PaintMarks({ id, paints }: { id: number; paints: RefObject<Map<number, PaintMark[]>> }) {
  const meshes = useRef<(THREE.Mesh | null)[]>([])
  const spots = useMemo(
    () =>
      SPOTS.map((spot, index) => {
        const position = new THREE.Vector3(...spot)
        const normal = position.clone().sub(HEAD_CENTER).normalize()
        const quaternion = new THREE.Quaternion().setFromUnitVectors(FORWARD, normal)
        // 자국마다 조금씩 돌려 도장처럼 똑같아 보이지 않게 한다.
        quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(FORWARD, index * 1.1))
        return { position, quaternion }
      }),
    [],
  )

  useFrame(() => {
    const now = performance.now()
    const marks = paints.current.get(id)?.filter((mark) => now - mark.at < PAINT_MS) ?? []
    meshes.current.forEach((mesh, index) => {
      if (!mesh) return
      const mark = marks[Math.floor(index / 2)]
      mesh.visible = mark !== undefined
      if (!mark) return
      const age = now - mark.at
      const size = Math.min(age / POP_MS, 1) * Math.min((PAINT_MS - age) / FADE_MS, 1)
      mesh.scale.set(size * 1.25, size * 0.9, Math.max(size * 0.22, 0.01))
      ;(mesh.material as THREE.MeshToonMaterial).color.set(mark.color)
    })
  })

  return (
    <>
      {spots.map(({ position, quaternion }, index) => (
        <mesh
          key={index}
          ref={(mesh) => {
            meshes.current[index] = mesh
          }}
          position={position}
          quaternion={quaternion}
          visible={false}
        >
          <sphereGeometry args={[0.08, 12, 8]} />
          <Skin thickness={1} />
        </mesh>
      ))}
    </>
  )
}
