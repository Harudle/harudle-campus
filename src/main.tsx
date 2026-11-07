import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AvatarPreview } from './scene/AvatarPreview'
import './styles.css'

createRoot(document.getElementById('scene')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
createRoot(document.getElementById('avPreview')!).render(<AvatarPreview />)   // 꾸미기 창 옆 미리보기(창이 열렸을 때만 캔버스를 띄운다)
