import type { RelayEpisode } from '../../data/relayEpisodes'
import type { WalkStageProps } from '../gallery/WalkStage'
import { WalkStage } from '../gallery/WalkStage'
import { RelayHall } from './RelayHall'
import { RELAY_EXIT_DOOR, RELAY_SPACE, RELAY_START } from './layout'

const DOORS = [RELAY_EXIT_DOOR]

type RelayCanvasProps = Omit<WalkStageProps, 'label' | 'space' | 'start' | 'doors' | 'children'> & {
  episodes: RelayEpisode[]
  onOpenEpisode: (number: number) => void
  onDrawFirst: () => void
}

export default function RelayCanvas({ episodes, onOpenEpisode, onDrawFirst, ...stage }: RelayCanvasProps) {
  return (
    <WalkStage
      {...stage}
      label="릴레이 만화 소설관. 긴 복도 왼쪽 벽에 필름이 이어지고, 복도 끝에 이젤이 있습니다."
      space={RELAY_SPACE}
      start={RELAY_START}
      doors={DOORS}
    >
      {({ onFloorClick, onSit }) => (
        <RelayHall episodes={episodes} disabled={stage.paused} onFloorClick={onFloorClick} onSit={onSit} onOpenEpisode={onOpenEpisode} onDrawFirst={onDrawFirst} onDoor={stage.onExit} />
      )}
    </WalkStage>
  )
}
