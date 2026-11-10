// 14층: 방에 걸린 하루들 월드 내용(만화·릴레이 화·퀴즈·특종)을 누르면 그 창만 캠퍼스 위에 띄운다.
// 월드 창은 자기 화면 규칙(Tailwind)을 그대로 쓰도록 같은 주소의 /world/campus.html 페이지로 따로 열고, 바탕은 비워 14층이 비쳐 보인다.
// 같은 주소라 저장 공간을 함께 쓰므로, 처음 열 때 캠퍼스 캐릭터와 이름을 월드에 넘겨준다(퀴즈 정답자 이름 등).
import type { AvatarConfig } from './harudle/avatarData'

const PAGE = '/world/campus.html'
/** world/campus/modal.tsx가 보내는 메시지 */
const CLOSED = 'harudle-world:closed'
const CHANGED = 'harudle-world:changed'
const WORLD_AVATAR_KEY = 'harudle-world.avatar'
const WORLD_NICKNAME_KEY = 'harudle-world.nickname'
const WORLD_NICKNAME_MAX = 12

type Identity = { avatar: AvatarConfig; name: string | null }

let open = false

function seedIdentity({ avatar, name }: Identity) {
  try {
    if (!localStorage.getItem(WORLD_AVATAR_KEY)) localStorage.setItem(WORLD_AVATAR_KEY, JSON.stringify(avatar))
    if (localStorage.getItem(WORLD_NICKNAME_KEY) === null && name) localStorage.setItem(WORLD_NICKNAME_KEY, name.slice(0, WORLD_NICKNAME_MAX))
  } catch {
    // 저장할 수 없으면 월드 창에서 이름을 새로 적는다
  }
}

/** view는 modal.tsx가 읽는 # 값(scoop, artwork=…, relay=…, quiz=…&room=…, register=…). 닫히면 onClose, 무언가 올리거나 걸면 onChanged */
export function openWorldWindow(view: string, identity: Identity, { onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  if (open) return
  open = true
  seedIdentity(identity)
  const root = document.createElement('div')
  root.id = 'worldWindow'
  const frame = document.createElement('iframe')
  frame.src = `${PAGE}#${view}`
  frame.title = '하루들 월드'
  frame.allow = 'clipboard-write'
  root.append(frame)

  const onMessage = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow || event.origin !== location.origin) return
    if (event.data === CHANGED) onChanged()
    if (event.data !== CLOSED) return
    open = false
    window.removeEventListener('message', onMessage)
    root.remove()
    document.body.classList.remove('in-world')
    onClose()
  }
  frame.addEventListener('load', () => frame.focus())
  window.addEventListener('message', onMessage)
  document.body.append(root)
  document.body.classList.add('in-world')
}
