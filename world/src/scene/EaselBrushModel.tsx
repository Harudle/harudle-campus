import { COLORS } from '../lib/brand'
import { Toon } from './toon'

/** 이젤 붓 하나를 이루는 막대, 쇠테, 붓털. 바닥에 놓인 붓과 손에 든 붓이 같은 모양과 크기로 보이도록 함께 쓴다. +y가 붓 끝이다. */
export const EASEL_BRUSH_SCALE = 1.65

export function EaselBrushModel({ tipColor = COLORS.primary }: { tipColor?: string }) {
  return (
    <group scale={EASEL_BRUSH_SCALE}>
      <mesh position-y={-0.1} castShadow>
        <cylinderGeometry args={[0.045, 0.06, 0.9, 10]} />
        <Toon color={COLORS.butter} outlineThickness={1.2} />
      </mesh>
      <mesh position-y={0.4}>
        <cylinderGeometry args={[0.07, 0.055, 0.12, 10]} />
        <Toon color="#DBD6D1" outlineThickness={1.2} />
      </mesh>
      <mesh position-y={0.55} scale={[1, 1.6, 1]} castShadow>
        <sphereGeometry args={[0.09, 14, 10]} />
        <Toon color={tipColor} outlineThickness={1.3} />
      </mesh>
    </group>
  )
}
