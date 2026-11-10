import type { ThreeEvent } from '@react-three/fiber'
import type { RelayEpisode } from '../../data/relayEpisodes'
import { COLORS, FONT_BODY, FONT_DISPLAY } from '../../lib/brand'
import { Bench, Wall, WallDoor } from '../gallery/Hall'
import { FACING_BACK_WALL, FACING_FRONT_WALL, FACING_LEFT_WALL, FACING_RIGHT_WALL } from '../gallery/layout'
import { Toon } from '../toon'
import { useCanvasTexture, type DrawFn } from '../useCanvasTexture'
import { FilmStrip } from './FilmStrip'
import {
  EASEL_POSITION,
  FRAME_Z,
  RELAY_BENCHES,
  RELAY_EXIT_DOOR,
  RELAY_HALF_X,
  RELAY_HALF_Z,
  RELAY_WALL_HEIGHT,
} from './layout'
import { RelayEasel } from './RelayEasel'

const WALL_COLOR = '#F6E7D2'
const SIDE_WALL_COLOR = '#EFDCC2'
const PLANK_LIGHT = '#D9B48A'
const PLANK_DARK = '#CDA57A'
const SCROLL_LENGTH = 30
const FILM_Y = 3.1
const PLANK_WIDTH = 1.3

const drawFloor: DrawFn = (ctx, w, h) => {
  const plank = (w / (RELAY_HALF_X * 2)) * PLANK_WIDTH
  for (let column = 0; column * plank < w; column++) {
    ctx.fillStyle = column % 2 === 0 ? PLANK_LIGHT : PLANK_DARK
    ctx.fillRect(column * plank, 0, plank, h)
  }
  // 복도를 따라 이젤까지 이어지는 카펫
  const carpet = w * 0.3
  ctx.fillStyle = COLORS.lavender200
  ctx.fillRect((w - carpet) / 2, 0, carpet, h)
  ctx.strokeStyle = COLORS.paper
  ctx.lineWidth = 6
  ctx.setLineDash([24, 18])
  ctx.strokeRect((w - carpet) / 2 + 12, -10, carpet - 24, h + 20)
}

const drawTitle: DrawFn = (ctx, w, h) => {
  ctx.fillStyle = COLORS.primaryDeep
  ctx.font = `${h * 0.72}px ${FONT_DISPLAY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('릴레이 만화 소설관', w / 2, h / 2)
}

const drawScroll: DrawFn = (ctx, w, h) => {
  ctx.fillStyle = COLORS.paper
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = COLORS.lavender200
  ctx.lineWidth = 3
  for (let y = h * 0.2; y < h; y += h * 0.2) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }
  ctx.fillStyle = COLORS.primaryDeep
  ctx.font = `${h * 0.3}px ${FONT_BODY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('앞사람의 마지막 컷을 보고, 다음 네 컷을 이어 그려요. 이 이야기는 끝나지 않아요.', w / 2, h / 2)
}

type RelayHallProps = {
  episodes: RelayEpisode[]
  disabled: boolean
  onFloorClick: (event: ThreeEvent<MouseEvent>) => void
  onSit: (point: { x: number; z: number }) => void
  onOpenEpisode: (number: number) => void
  onDrawFirst: () => void
  onDoor: (id: string) => void
}

/** 아늑한 복도. 왼쪽 벽에 필름, 오른쪽 벽에 두루마리, 끝에 최신 화 이젤이 있다. */
export function RelayHall({ episodes, disabled, onFloorClick, onSit, onOpenEpisode, onDrawFirst, onDoor }: RelayHallProps) {
  const width = RELAY_HALF_X * 2
  const depth = RELAY_HALF_Z * 2
  const latest = episodes[episodes.length - 1] ?? null
  // 필름 칸보다 많으면 최근 화를 건다. 전체는 뷰어에서 본다.
  const onFilm = episodes.slice(-FRAME_Z.length)
  const floor = useCanvasTexture(drawFloor, 512, Math.round((512 * depth) / width))
  const title = useCanvasTexture(drawTitle, 768, 96)
  const scroll = useCanvasTexture(drawScroll, 2048, 96)

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow onClick={onFloorClick}>
        <planeGeometry args={[width, depth]} />
        <Toon map={floor} outline={false} />
      </mesh>
      <Wall x={0} z={-RELAY_HALF_Z} rotationY={FACING_BACK_WALL} length={width} height={RELAY_WALL_HEIGHT} bumps={9} color={WALL_COLOR}>
        <mesh position={[0, 5.2, 0.05]}>
          <planeGeometry args={[6.4, 0.8]} />
          <meshBasicMaterial map={title} transparent toneMapped={false} />
        </mesh>
      </Wall>
      <Wall x={0} z={RELAY_HALF_Z} rotationY={FACING_FRONT_WALL} length={width} height={RELAY_WALL_HEIGHT} bumps={9} color={WALL_COLOR} />
      {/* 왼쪽 벽은 안쪽을 볼 때 입구가 오른쪽이라 가로 위치는 -z다. */}
      <Wall x={-RELAY_HALF_X} z={0} rotationY={FACING_LEFT_WALL} length={depth} height={RELAY_WALL_HEIGHT} bumps={26} color={SIDE_WALL_COLOR}>
        <FilmStrip
          episodes={onFilm}
          offsets={FRAME_Z.map((z) => -z)}
          length={SCROLL_LENGTH}
          y={FILM_Y}
          disabled={disabled}
          onOpen={onOpenEpisode}
        />
      </Wall>
      <Wall x={RELAY_HALF_X} z={0} rotationY={FACING_RIGHT_WALL} length={depth} height={RELAY_WALL_HEIGHT} bumps={26} color={SIDE_WALL_COLOR}>
        <mesh position={[0, 3.1, 0.04]}>
          <planeGeometry args={[SCROLL_LENGTH, 1.4]} />
          <meshBasicMaterial map={scroll} toneMapped={false} />
        </mesh>
        {[-SCROLL_LENGTH / 2, SCROLL_LENGTH / 2].map((x) => (
          <mesh key={x} position={[x, 3.1, 0.14]} castShadow>
            <cylinderGeometry args={[0.16, 0.16, 1.9, 12]} />
            <Toon color="#B9855A" />
          </mesh>
        ))}
      </Wall>
      <WallDoor door={RELAY_EXIT_DOOR} paused={disabled} onEnter={onDoor} />
      {RELAY_BENCHES.map((bench) => (
        <Bench key={`${bench.x},${bench.z}`} {...bench} disabled={disabled} onSit={onSit} />
      ))}
      <RelayEasel
        key={latest?.id ?? 'empty'}
        episode={latest}
        x={EASEL_POSITION.x}
        z={EASEL_POSITION.z}
        disabled={disabled}
        onOpen={() => (latest ? onOpenEpisode(latest.number) : onDrawFirst())}
      />
    </group>
  )
}
