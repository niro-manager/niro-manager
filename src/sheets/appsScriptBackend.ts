import type { CellValue } from '../domain/cells'
import { SheetsError, type SheetsBackend, type SheetsErrorKind } from './sheetsClient'

// Apps Script 웹 앱 안에서 google.script.run으로 서버 함수(apps-script/Code.js)를 부른다.
// 웹 앱은 소유자 계정으로 실행되므로 앱에서 따로 로그인하거나 토큰을 다루지 않는다.

/** 서버 함수 이름과 인자로 호출한다. 테스트에서는 가짜 구현을 넣는다 */
export type ServerCall = (name: string, ...args: unknown[]) => Promise<unknown>

interface ScriptRun {
  withSuccessHandler(handler: (value: unknown) => void): ScriptRun
  withFailureHandler(handler: (error: unknown) => void): ScriptRun
  [name: string]: unknown
}

function scriptRun(): ScriptRun | null {
  const g = globalThis as { google?: { script?: { run?: ScriptRun } } }
  return g.google?.script?.run ?? null
}

/** Apps Script 웹 앱 안에서 열렸는지 */
export function isInAppsScript(): boolean {
  return scriptRun() !== null
}

const googleScriptCall: ServerCall = (name, ...args) =>
  new Promise((resolve, reject) => {
    const run = scriptRun()
    if (!run) return reject(new SheetsError('api', 'Apps Script 웹 앱에서 열어야 시트에 연결할 수 있습니다.'))
    const fn = run.withSuccessHandler(resolve).withFailureHandler(reject)[name]
    if (typeof fn !== 'function') return reject(new SheetsError('api', `서버 함수 ${name}이(가) 없습니다. Apps Script에 Code.js를 다시 올려 주세요.`))
    ;(fn as (...a: unknown[]) => void)(...args)
  })

const KINDS: SheetsErrorKind[] = ['auth', 'access', 'notFound', 'network', 'api']

/** google.script.run 실패를 오류 종류로 구분한다. 서버 함수는 "[종류] 메시지" 형식으로 던진다 */
export function toSheetsError(error: unknown): SheetsError {
  if (error instanceof SheetsError) return error
  const message = error instanceof Error ? error.message : String(error)
  const tagged = /^(?:Error: )?\[(\w+)\] ([\s\S]*)$/.exec(message)
  if (tagged && KINDS.includes(tagged[1] as SheetsErrorKind)) return new SheetsError(tagged[1] as SheetsErrorKind, tagged[2]!)
  if (/NetworkError|HTTP 0|Failed to fetch/i.test(message)) return new SheetsError('network', '네트워크에 연결할 수 없습니다.')
  if (/authoriz|로그인|sign in/i.test(message)) {
    return new SheetsError('auth', 'Google 로그인이 필요합니다. 페이지를 새로고침해 다시 로그인해 주세요.')
  }
  return new SheetsError('api', `시트 요청이 실패했습니다. (${message})`)
}

export function createAppsScriptBackend(call: ServerCall = googleScriptCall): SheetsBackend {
  const invoke = async <T>(name: string, ...args: unknown[]): Promise<T> => {
    try {
      return (await call(name, ...args)) as T
    } catch (e) {
      throw toSheetsError(e)
    }
  }
  return {
    getInfo: () => invoke('getInfo'),
    async batchGetValues(ranges) {
      const result = await invoke<CellValue[][][] | null>('batchGetValues', ranges)
      return ranges.map((_, i) => result?.[i] ?? [])
    },
    async getSheetId(sheetName) {
      const id = await invoke<number | null>('getSheetId', sheetName)
      return typeof id === 'number' ? id : null
    },
    async batchUpdate(requests) {
      await invoke<null>('batchUpdate', requests)
    },
  }
}
