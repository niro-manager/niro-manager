import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Apps Script 웹 앱(HtmlService)은 HTML 파일 하나만 내보낼 수 있으므로 JS·CSS를 index.html 안에 넣는다.
// 빌드 결과 dist/에는 index.html과 Apps Script 서버 코드(apps-script/)가 함께 들어가 그대로 Apps Script에 올릴 수 있다.
function appsScriptBundle(): Plugin {
  return {
    name: 'apps-script-bundle',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = bundle['index.html']
      if (!html || html.type !== 'asset') return
      let source = String(html.source)
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (fileName === 'index.html') continue
        if (chunk.type === 'chunk' && chunk.isEntry) {
          // 스크립트 안의 "</script"가 태그를 닫지 않도록 바꾼다. 치환 문자열의 $ 패턴을 피하려고 함수로 바꾼다.
          const code = chunk.code.replace(/<\/script/gi, '<\\/script')
          source = source.replace(new RegExp(`<script[^>]*src="[^"]*${fileName}"[^>]*></script>`), () => `<script type="module">\n${code}</script>`)
        } else if (chunk.type === 'asset' && fileName.endsWith('.css')) {
          source = source.replace(new RegExp(`<link[^>]*href="[^"]*${fileName}"[^>]*>`), () => `<style>\n${String(chunk.source)}</style>`)
        } else {
          continue
        }
        delete bundle[fileName]
      }
      html.source = source
    },
    closeBundle() {
      for (const file of ['Code.js', 'appsscript.json']) copyFileSync(resolve('apps-script', file), resolve('dist', file))
    },
  }
}

export default defineConfig({
  base: './',
  build: { assetsInlineLimit: Number.MAX_SAFE_INTEGER, cssCodeSplit: false, modulePreload: false },
  plugins: [react(), appsScriptBundle()],
})
