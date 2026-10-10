import { loadScript } from '../auth/loadScript'
import type { GoogleConfig } from '../config'

const GAPI_SRC = 'https://apis.google.com/js/api.js'

export interface PickedFile {
  id: string
  name: string
}

async function loadPicker(): Promise<void> {
  await loadScript(GAPI_SRC)
  await new Promise<void>((resolve, reject) => {
    gapi.load('picker', { callback: resolve, onerror: () => reject(new Error('파일 선택 창을 불러오지 못했습니다.')) })
  })
}

/**
 * Google Picker로 스프레드시트를 하나 고른다. 고른 파일에 대해 앱(drive.file 범위)의 접근이 허용된다.
 * 취소하면 null을 돌려준다.
 */
export async function pickSpreadsheet(config: GoogleConfig, accessToken: string): Promise<PickedFile | null> {
  await loadPicker()
  return new Promise<PickedFile | null>((resolve) => {
    const view = new google.picker.DocsView(google.picker.ViewId.SPREADSHEETS).setMode(google.picker.DocsViewMode.LIST)
    const picker = new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(config.apiKey)
      .setAppId(config.appId)
      .setLocale('ko')
      .setTitle('차계부 스프레드시트 선택')
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED) {
          const doc = data.docs?.[0]
          resolve(doc ? { id: doc.id, name: doc.name ?? doc.id } : null)
        } else if (data.action === google.picker.Action.CANCEL) {
          resolve(null)
        }
      })
      .build()
    picker.setVisible(true)
  })
}
