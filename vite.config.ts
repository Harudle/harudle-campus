import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// 기본: dist/ (서버가 내보내는 사이트)
// --mode artifact: dist-artifact/index.html 한 파일 (Claude 아티팩트용, 스크립트·스타일을 모두 안에 넣는다)
export default defineConfig(({ mode }) => {
  const artifact = mode === 'artifact'
  return {
    plugins: [react(), ...(artifact ? [viteSingleFile()] : [])],
    // public/은 예전 서버(단일 HTML 버전)가 읽는 자리라 비워 두지 않는다. 사이트 정적 파일은 static/
    publicDir: 'static',
    build: {
      outDir: artifact ? 'dist-artifact' : 'dist',
      emptyOutDir: true,
      copyPublicDir: !artifact,
      chunkSizeWarningLimit: 2000,
    },
    server: { port: 8080, proxy: { '/api': 'http://127.0.0.1:3000', '/ws': { target: 'ws://127.0.0.1:3000', ws: true } } },
  }
})
