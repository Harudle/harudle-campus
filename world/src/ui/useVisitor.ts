import { useCallback, useState } from 'react'
import { DEFAULT_AVATAR, loadAvatar, saveAvatar, type AvatarConfig } from '../data/avatar'
import { loadNickname, saveNickname } from '../data/nickname'
import { loadSettings, saveSettings, type GallerySettings } from '../data/settings'

/** 전시관과 오락실이 함께 쓰는 방문자의 아바타와 설정. 처음 온 방문자는 입장 전에 꾸민다. */
export function useVisitor() {
  const [savedAvatar] = useState(loadAvatar)
  const [savedNickname] = useState(loadNickname)
  const [nickname, setNickname] = useState(savedNickname ?? '')
  // 닉네임을 정한 적 없는 방문자도 한 번은 입장 화면을 거친다.
  const needsSetup = savedAvatar === null || savedNickname === null
  const [avatar, setAvatar] = useState<AvatarConfig>(savedAvatar ?? DEFAULT_AVATAR)
  const [customizing, setCustomizing] = useState(needsSetup)
  const [firstVisit, setFirstVisit] = useState(needsSetup)
  const [settings, setSettings] = useState<GallerySettings>(loadSettings)

  const changeSettings = useCallback((next: GallerySettings) => {
    setSettings(next)
    saveSettings(next)
  }, [])

  const confirmAvatar = useCallback(
    (next: AvatarConfig, doodleFollows: boolean, nextNickname: string) => {
      setAvatar(next)
      saveAvatar(next)
      setNickname(nextNickname)
      saveNickname(nextNickname)
      changeSettings({ ...settings, doodleFollows })
      setCustomizing(false)
      setFirstVisit(false)
    },
    [changeSettings, settings],
  )

  return { avatar, nickname, customizing, setCustomizing, firstVisit, settings, changeSettings, confirmAvatar }
}
