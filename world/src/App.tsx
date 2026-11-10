import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import type { ArcadeRoomId } from './data/arcadeQuizzes'
import { ArcadeSpace } from './ui/ArcadeSpace'
import { GallerySpace } from './ui/GallerySpace'
import { Hud } from './ui/Hud'
import { RelaySpace } from './ui/RelaySpace'
import { ScoopModal } from './ui/ScoopModal'

const LobbyCanvas = lazy(() => import('./scene/LobbyCanvas'))

const GALLERY_HASH = '#gallery'
const ARCADE_HASH = '#arcade'
const RELAY_HASH = '#relay'

type Space = 'lobby' | 'arcade' | 'relay' | 'gallery'

/** 오락실 안의 퀴즈 방은 #arcade-song처럼 주소에 남긴다. */
const ARCADE_ROOM_HASH = /^#arcade-(song|drama)$/

function spaceFromHash(): Space {
  if (window.location.hash === GALLERY_HASH) return 'gallery'
  if (window.location.hash === RELAY_HASH) return 'relay'
  if (window.location.hash === ARCADE_HASH || ARCADE_ROOM_HASH.test(window.location.hash)) return 'arcade'
  return 'lobby'
}

function arcadeRoomFromHash() {
  return (ARCADE_ROOM_HASH.exec(window.location.hash)?.[1] ?? null) as ArcadeRoomId | null
}

function supportsWebGL() {
  try {
    return document.createElement('canvas').getContext('webgl2') !== null
  } catch {
    return false
  }
}

/** 공간을 주소에 남겨 뒤로 가기와 직접 링크가 동작하게 한다. */
function useSpace() {
  const [space, setSpace] = useState(spaceFromHash)
  const [arcadeRoom, setArcadeRoom] = useState(arcadeRoomFromHash)

  useEffect(() => {
    const sync = () => {
      setSpace(spaceFromHash())
      setArcadeRoom(arcadeRoomFromHash())
    }
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  const goTo = useCallback((next: Space) => {
    window.location.hash = next === 'lobby' ? '' : { gallery: GALLERY_HASH, arcade: ARCADE_HASH, relay: RELAY_HASH }[next]
  }, [])

  return { space, arcadeRoom, goTo }
}

export function App() {
  const [scoopOpen, setScoopOpen] = useState(false)
  const [hasOpened, setHasOpened] = useState(false)
  const [webgl] = useState(supportsWebGL)
  const { space, arcadeRoom, goTo } = useSpace()

  const openScoop = useCallback(() => {
    setScoopOpen(true)
    setHasOpened(true)
  }, [])
  const closeScoop = useCallback(() => setScoopOpen(false), [])
  const enterGallery = useCallback(() => goTo('gallery'), [goTo])
  const enterArcade = useCallback(() => goTo('arcade'), [goTo])
  const enterRelay = useCallback(() => goTo('relay'), [goTo])
  const enterArcadeRoom = useCallback((id: ArcadeRoomId) => {
    window.location.hash = `${ARCADE_HASH}-${id}`
  }, [])
  const backToLobby = useCallback(() => goTo('lobby'), [goTo])

  return (
    <main className="relative h-full w-full overflow-hidden bg-haru-50">
      {space === 'arcade' ? (
        <ArcadeSpace webgl={webgl} roomId={arcadeRoom} onEnterRoom={enterArcadeRoom} onLeaveRoom={enterArcade} onExit={backToLobby} />
      ) : space === 'relay' ? (
        <RelaySpace webgl={webgl} onExit={backToLobby} />
      ) : webgl && space === 'gallery' ? (
        <GallerySpace onExit={backToLobby} />
      ) : (
        <>
          {webgl && (
            <Suspense fallback={null}>
              <LobbyCanvas
                modalOpen={scoopOpen}
                showHint={!hasOpened}
                onOpenScoop={openScoop}
                onEnterGallery={enterGallery}
                onEnterArcade={enterArcade}
                onEnterRelay={enterRelay}
              />
            </Suspense>
          )}
          <Hud webgl={webgl} onOpenScoop={openScoop} onEnterGallery={enterGallery} onEnterArcade={enterArcade} onEnterRelay={enterRelay} />
          <ScoopModal open={scoopOpen} onClose={closeScoop} />
        </>
      )}
    </main>
  )
}
