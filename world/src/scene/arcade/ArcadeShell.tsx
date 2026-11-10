import { useMemo, type ReactNode } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { Wall } from '../gallery/Hall'
import { FACING_BACK_WALL, FACING_FRONT_WALL, FACING_LEFT_WALL, FACING_RIGHT_WALL } from '../gallery/layout'
import { Toon } from '../toon'
import { useCanvasTexture, type DrawFn } from '../useCanvasTexture'
import { ARCADE_WALL_HEIGHT } from './layout'

const WALL_COLOR = '#2A2058'
const SIDE_WALL_COLOR = '#352A70'
const TILE_LIGHT = '#43358F'
const TILE_DARK = '#30266E'
const TILE_SIZE = 2
const FLOOR_TEXTURE_WIDTH = 2048

/** 입구 홀과 퀴즈 방이 함께 쓰는 어두운 바닥과 벽. children은 뒷벽에 붙는다. */
export function ArcadeShell({ halfX, halfZ, onFloorClick, leftWall, rightWall, children }: {
  halfX: number
  halfZ: number
  onFloorClick: (event: ThreeEvent<MouseEvent>) => void
  leftWall?: ReactNode
  rightWall?: ReactNode
  children: ReactNode
}) {
  const draw = useMemo<DrawFn>(
    () => (ctx, w, h) => {
      const cell = (w / (halfX * 2)) * TILE_SIZE
      for (let row = 0; row * cell < h; row++) {
        for (let column = 0; column * cell < w; column++) {
          ctx.fillStyle = (row + column) % 2 === 0 ? TILE_LIGHT : TILE_DARK
          ctx.fillRect(column * cell, row * cell, cell + 1, cell + 1)
        }
      }
    },
    [halfX],
  )
  const floor = useCanvasTexture(draw, FLOOR_TEXTURE_WIDTH, Math.round((FLOOR_TEXTURE_WIDTH * halfZ) / halfX))
  const width = halfX * 2
  const depth = halfZ * 2
  const widthBumps = Math.round(width * 0.67)
  const depthBumps = Math.round(depth * 0.67)

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow onClick={onFloorClick}>
        <planeGeometry args={[width, depth]} />
        <Toon map={floor} outline={false} />
      </mesh>
      <Wall x={0} z={-halfZ} rotationY={FACING_BACK_WALL} length={width} height={ARCADE_WALL_HEIGHT} bumps={widthBumps} color={WALL_COLOR}>
        {children}
      </Wall>
      <Wall x={0} z={halfZ} rotationY={FACING_FRONT_WALL} length={width} height={ARCADE_WALL_HEIGHT} bumps={widthBumps} color={WALL_COLOR} />
      <Wall x={-halfX} z={0} rotationY={FACING_LEFT_WALL} length={depth} height={ARCADE_WALL_HEIGHT} bumps={depthBumps} color={SIDE_WALL_COLOR}>
        {leftWall}
      </Wall>
      <Wall x={halfX} z={0} rotationY={FACING_RIGHT_WALL} length={depth} height={ARCADE_WALL_HEIGHT} bumps={depthBumps} color={SIDE_WALL_COLOR}>
        {rightWall}
      </Wall>
    </group>
  )
}
