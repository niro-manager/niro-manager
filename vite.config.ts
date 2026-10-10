import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages 배포 경로: https://niro-manager.github.io/niro-manager/
// manifest id, start_url, scope도 이 경로를 기준으로 한다(docs/PWA_GUIDE.md).
export default defineConfig({
  base: '/niro-manager/',
  plugins: [react()],
})
