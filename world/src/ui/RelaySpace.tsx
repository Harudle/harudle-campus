import { lazy, Suspense, useRef, useState } from 'react'
import { usePresence } from '../data/presence'
import { useRelayEpisodes } from '../data/relayEpisodes'
import type { JoystickInput } from '../scene/gallery/Player'
import { ActionButtons } from './ActionButtons'
import { AvatarCustomizer } from './AvatarCustomizer'
import { ChatPanel } from './ChatPanel'
import { ControlsGuide, useControlsGuide } from './ControlsGuide'
import { useDoorPrompt } from './DoorPrompt'
import { RegisterEpisodeModal } from './RegisterEpisodeModal'
import { RelayHud } from './RelayHud'
import { RelayViewerModal } from './RelayViewerModal'
import { TouchJoystick } from './TouchJoystick'
import { useVisitor } from './useVisitor'

const RelayCanvas = lazy(() => import('../scene/relay/RelayCanvas'))

const RELAY_ROOM = 'relay'

export function RelaySpace({ webgl, onExit }: { webgl: boolean; onExit: () => void }) {
  const { avatar, nickname, customizing, setCustomizing, firstVisit, settings, confirmAvatar } = useVisitor()
  const { episodes, reload, remove, report } = useRelayEpisodes()
  const [viewing, setViewing] = useState<number | null>(null)
  const [registering, setRegistering] = useState(false)
  const joystick = useRef<JoystickInput>({ x: 0, y: 0 })
  const guide = useControlsGuide()
  const { status, others, total, positions, sendMove, chat, speech, mySpeech, play, hitNotice } = usePresence(webgl && !firstVisit, avatar, settings.doodleFollows, RELAY_ROOM, nickname)
  const latest = episodes[episodes.length - 1] ?? null

  const openRegister = () => setRegistering(true)
  const { requestDoor, doorPrompt, doorPromptOpen } = useDoorPrompt(onExit, () => '로비로')

  const hud = (
    <RelayHud
      episodeCount={episodes.length}
      presenceStatus={webgl ? status : 'offline'}
      visitorCount={total}
      walkable={webgl}
      onOpenEpisode={setViewing}
      onRegister={openRegister}
      onCustomize={() => setCustomizing(true)}
      onOpenGuide={guide.show}
      onExit={onExit}
    />
  )
  const dialogs = (
    <>
      <RelayViewerModal
        episodes={episodes}
        startEpisode={viewing}
        onDrawNext={openRegister}
        onRemove={remove}
        onReport={report}
        onClose={() => setViewing(null)}
      />
      <RegisterEpisodeModal
        open={registering}
        latest={latest}
        onRegistered={() => {
          setRegistering(false)
          setViewing(null)
          reload()
        }}
        onClose={() => setRegistering(false)}
      />
    </>
  )

  // WebGL이 없으면 3D 공간 없이 뷰어만 쓴다.
  if (!webgl) {
    return (
      <>
        {hud}
        {dialogs}
      </>
    )
  }

  return (
    <>
      <Suspense fallback={null}>
        <RelayCanvas
          episodes={episodes}
          avatar={avatar}
          nickname={nickname}
          doodleFollows={settings.doodleFollows}
          others={others.filter((player) => player.room === RELAY_ROOM)}
          speech={speech}
          mySpeech={mySpeech}
          play={play}
          positions={positions}
          onMove={sendMove}
          paused={customizing || viewing !== null || registering || doorPromptOpen}
          joystick={joystick}
          onOpenEpisode={setViewing}
          onDrawFirst={openRegister}
          onExit={requestDoor}
        />
      </Suspense>
      {hud}
      {doorPrompt}
      <TouchJoystick input={joystick} onUse={guide.dismissHint} />
      <ActionButtons controls={joystick} throwRequest={play.throwRequest} hitNotice={hitNotice} />
      <ChatPanel chat={chat} />
      <ControlsGuide guide={guide} tip="복도를 따라 걸어 보세요. 필름 칸이나 이젤을 누르면 만화를 크게 볼 수 있어요." />
      {dialogs}
      <AvatarCustomizer
        open={customizing}
        value={avatar}
        doodleFollows={settings.doodleFollows}
        nickname={nickname}
        firstVisit={firstVisit}
        onConfirm={confirmAvatar}
      />
    </>
  )
}
