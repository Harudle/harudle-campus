import { Outlines } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { COLORS } from '../lib/brand'

function createToonRamp() {
  const ramp = new THREE.DataTexture(new Uint8Array([120, 200, 255]), 3, 1, THREE.RedFormat)
  ramp.minFilter = THREE.NearestFilter
  ramp.magFilter = THREE.NearestFilter
  ramp.needsUpdate = true
  return ramp
}

const toonRamp = createToonRamp()

type ToonProps = {
  color?: string
  map?: THREE.Texture | null
  /** 도형에 면마다 넣어 둔 밝기를 함께 쓴다. */
  vertexColors?: boolean
  outline?: boolean
  /** 외곽선 두께(CSS 픽셀). 카메라 거리와 상관없이 일정해 만화 펜선처럼 보인다. */
  outlineThickness?: number
  outlineColor?: string
}

/** 만화풍 셀 셰이딩 재질. 메시의 자식으로 넣으면 외곽선까지 함께 붙는다. */
export function Toon({ color = '#ffffff', map = null, vertexColors = false, outline = true, outlineThickness = 1.8, outlineColor = COLORS.outline }: ToonProps) {
  // Outlines는 렌더 시점의 드로잉 버퍼 크기로 두께를 계산하므로 리사이즈 때 다시 렌더한다.
  useThree((state) => state.size)
  const dpr = useThree((state) => state.viewport.dpr)
  return (
    <>
      <meshToonMaterial color={color} map={map} vertexColors={vertexColors} gradientMap={toonRamp} />
      {outline && <Outlines thickness={outlineThickness * dpr} color={outlineColor} />}
    </>
  )
}
