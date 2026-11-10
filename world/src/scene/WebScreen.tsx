import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useFrame, useThree, type ThreeElements } from '@react-three/fiber'
import * as THREE from 'three'
import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js'

type WebScreenProps = Omit<ThreeElements['group'], 'children'> & {
  /** 3D 공간에서 화면의 크기 */
  width: number
  height: number
  /** 화면 안에 그릴 웹 페이지의 CSS 크기 */
  viewportWidth: number
  viewportHeight: number
  className?: string
  children: ReactNode
}

type Layer = { renderer: CSS3DRenderer; scene: THREE.Scene; object: CSS3DObject; root: Root }

/** 3D 화면을 누른 것인지. 웹 화면을 둔 3D 화면은 캔버스 대신 바깥 상자(data-scene)나 캔버스를 바로 감싼 상자가 터치를 받는다. */
export function sceneCanvasOf(target: EventTarget | null): HTMLCanvasElement | null {
  if (target instanceof HTMLCanvasElement) return target
  if (!(target instanceof HTMLElement)) return null
  const insideScene = target.dataset.scene !== undefined || target.parentElement?.dataset.scene !== undefined
  return insideScene ? target.querySelector('canvas') : null
}

/**
 * 3D 공간 속 평면에 진짜 웹 페이지를 띄운다. 웹 페이지는 캔버스 뒤에 깔고 그 자리만 캔버스를 투명하게 뚫어서,
 * 앞을 지나가는 물체가 화면을 자연스럽게 가리면서도 웹 페이지를 직접 누르고 스크롤할 수 있다.
 * 캔버스는 마우스를 받지 않게 되므로 Canvas에 data-scene을 달고 sceneCanvasOf로 3D 화면 터치를 가린다.
 */
export function WebScreen({ width, height, viewportWidth, viewportHeight, className, children, ...groupProps }: WebScreenProps) {
  const gl = useThree((state) => state.gl)
  const host = useThree((state) => state.events.connected as HTMLElement | undefined)
  const anchor = useRef<THREE.Group>(null)
  const layer = useRef<Layer | null>(null)
  const pageScale = useMemo(() => new THREE.Matrix4().makeScale(width / viewportWidth, height / viewportHeight, 1), [width, height, viewportWidth, viewportHeight])

  useEffect(() => {
    const container = host ?? gl.domElement.parentElement?.parentElement
    if (!container) return
    const renderer = new CSS3DRenderer()
    Object.assign(renderer.domElement.style, { position: 'absolute', inset: '0', zIndex: '0', pointerEvents: 'none' })
    container.prepend(renderer.domElement)

    // 다시 붙을 때마다 새 요소를 쓴다. 이전 root를 늦게 지워도 새 화면을 비우지 않는다.
    const element = document.createElement('div')
    element.className = className ?? ''
    Object.assign(element.style, { width: `${viewportWidth}px`, height: `${viewportHeight}px`, backfaceVisibility: 'hidden' })
    const object = new CSS3DObject(element)
    object.matrixAutoUpdate = false
    const scene = new THREE.Scene()
    scene.add(object)
    const root = createRoot(element)
    layer.current = { renderer, scene, object, root }

    const canvas = gl.domElement
    const previous = { position: canvas.style.position, zIndex: canvas.style.zIndex, pointerEvents: canvas.style.pointerEvents }
    Object.assign(canvas.style, { position: 'relative', zIndex: '1', pointerEvents: 'none' })

    return () => {
      layer.current = null
      Object.assign(canvas.style, previous)
      scene.remove(object)
      renderer.domElement.remove()
      // 3D 화면을 그리는 도중에 다른 React root를 곧바로 지우면 React가 경고하므로 한 박자 늦춘다.
      setTimeout(() => root.unmount())
    }
  }, [gl, host, className, viewportWidth, viewportHeight])

  useEffect(() => {
    layer.current?.root.render(children)
  })

  useFrame(({ camera, size }) => {
    const current = layer.current
    if (!current || !anchor.current) return
    const rendered = current.renderer.getSize()
    if (rendered.width !== size.width || rendered.height !== size.height) current.renderer.setSize(size.width, size.height)
    anchor.current.updateWorldMatrix(true, false)
    current.object.matrix.multiplyMatrices(anchor.current.matrixWorld, pageScale)
    current.renderer.render(current.scene, camera)
  })

  return (
    <group ref={anchor} {...groupProps}>
      {/* 투명하게 칠해 뒤에 깔린 웹 페이지가 보이게 하는 구멍. 섞지 않고 그대로 써야 캔버스가 뚫린다. */}
      <mesh>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial color="#000000" opacity={0} blending={THREE.NoBlending} />
      </mesh>
    </group>
  )
}
