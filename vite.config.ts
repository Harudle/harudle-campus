import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// 월드 API는 app.js가 받는다(world/server/campus.ts). 개발 서버에서도 같은 곳으로 넘긴다.
const WORLD_API = ['/cheers', '/quizzes', '/relay', '/crab-game', '/easel', '/s3-image']

// 기본: dist/ (서버가 내보내는 사이트). 14층은 dist/world/index.html(하루들 월드)와 campus.html(14층에서 여는 월드 창)
// --mode artifact: dist-artifact/index.html 한 파일 (Claude 아티팩트용, 스크립트·스타일을 모두 안에 넣는다). 14층 월드는 빠진다
export default defineConfig(({ mode }) => {
  const artifact = mode === 'artifact'
  return {
    plugins: [react(), ...(artifact ? [viteSingleFile()] : [tailwindcss()])],
    // public/은 예전 서버(단일 HTML 버전)가 읽는 자리라 비워 두지 않는다. 사이트 정적 파일은 static/
    publicDir: 'static',
    build: {
      outDir: artifact ? 'dist-artifact' : 'dist',
      emptyOutDir: true,
      copyPublicDir: !artifact,
      chunkSizeWarningLimit: 2000,
      ...(artifact ? {} : { rollupOptions: { input: { main: 'index.html', world: 'world/index.html', modal: 'world/campus.html' } } }),
    },
    server: {
      port: 8080,
      proxy: {
        '/api': 'http://127.0.0.1:3000',
        '/auth': 'http://127.0.0.1:3000',   // 하루들 연동: 연동하기를 누른 화면(이 주소)으로 돌아와야 그 브라우저의 캐릭터가 이어진다
        '/ws': { target: 'ws://127.0.0.1:3000', ws: true },
        '/world/ws': { target: 'ws://127.0.0.1:3000', ws: true },
        ...Object.fromEntries(WORLD_API.map((path) => [path, 'http://127.0.0.1:3000'])),
      },
    },
  }
})
