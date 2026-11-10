import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/jua/400.css'
import '@fontsource/gowun-dodum/400.css'
import './index.css'
import { App } from './App'
import { sceneCanvasOf } from './scene/WebScreen'

const root = document.getElementById('root')!

// 3D 카메라 조작은 화면의 모든 손가락 움직임을 듣는다. 조이스틱이나 버튼을 누른 손가락까지 회전으로 받으면
// 시점이 튀어 위에서 내려다보게 되므로, 3D 화면 밖의 터치는 여기서 멈춘다. React는 이 요소에서 듣기 때문에 그대로 받는다.
for (const type of ['pointermove', 'pointerup', 'pointercancel'] as const) {
  root.addEventListener(type, (event) => {
    if (event.pointerType === 'touch' && !sceneCanvasOf(event.target)) event.stopPropagation()
  })
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
