// apps-script/Code.js를 Apps Script 서비스 가짜 구현과 함께 불러 영수증 인식 흐름을 확인한다.
// 실제 Gemini·Drive는 부르지 않는다.
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const SOURCE = readFileSync(new URL('./Code.js', import.meta.url), 'utf8')

function load({ properties = {}, gemini, drive = { text: '단가 1,689', exportCode: 200 } } = {}) {
  const calls = { fetch: [], driveCreate: 0, driveRemove: 0 }
  const response = (code, body) => ({ getResponseCode: () => code, getContentText: () => body })
  const context = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in properties ? properties[k] : null) }) },
    UrlFetchApp: {
      fetch(url, options) {
        calls.fetch.push({ url, options })
        if (url.startsWith('https://generativelanguage.googleapis.com/')) {
          if (gemini instanceof Error) throw gemini
          return response(gemini.code, gemini.body)
        }
        return response(drive.exportCode, drive.text)
      },
    },
    Utilities: { newBlob: () => ({}), base64Decode: () => [] },
    ScriptApp: { getOAuthToken: () => 'token' },
    Drive: {
      Files: {
        create() {
          calls.driveCreate++
          return { id: 'temp-doc' }
        },
        remove() {
          calls.driveRemove++
        },
      },
    },
  }
  runInNewContext(SOURCE, context)
  return { context, calls }
}

const geminiBody = (fields) => JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(fields) }] } }] })
const FIELDS = { date: '2026-10-25', unitPrice: 1809, liters: 16, paid: 28944 }

describe('ocrReceipt (Apps Script 서버)', () => {
  it('키가 없으면 Drive 인식을 쓰고 임시 문서를 지운다', () => {
    const { context, calls } = load()
    expect(context.ocrReceipt('AAAA', 'image/jpeg')).toEqual({ engine: 'drive', text: '단가 1,689', tempFileLeft: false, gemini: 'no-key' })
    expect(calls.fetch.some((c) => c.url.includes('generativelanguage'))).toBe(false)
    expect([calls.driveCreate, calls.driveRemove]).toEqual([1, 1])
  })

  it('키가 있으면 Gemini로 읽고 Drive는 쓰지 않는다', () => {
    const { context, calls } = load({ properties: { GEMINI_API_KEY: 'test-key' }, gemini: { code: 200, body: geminiBody(FIELDS) } })
    expect(context.ocrReceipt('AAAA', 'image/jpeg')).toEqual({ engine: 'gemini', fields: FIELDS, text: '', tempFileLeft: false })
    expect(calls.driveCreate).toBe(0)
    const [call] = calls.fetch
    expect(call.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent')
    expect(call.options.headers).toEqual({ 'x-goog-api-key': 'test-key' })
    expect(call.url).not.toContain('test-key')
    const body = JSON.parse(call.options.payload)
    expect(body.contents[0].parts[1]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } })
    expect(body.generationConfig).toMatchObject({ responseMimeType: 'application/json', responseSchema: { required: ['date', 'unitPrice', 'liters', 'paid'] } })
    expect(body.generationConfig).not.toHaveProperty('temperature')
  })

  it('GEMINI_MODEL로 모델을 바꾸고, Gemini 3 이전 모델에는 temperature 0을 쓴다', () => {
    const { context, calls } = load({
      properties: { GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-2.5-flash' },
      gemini: { code: 200, body: geminiBody(FIELDS) },
    })
    context.ocrReceipt('AAAA', 'image/png')
    expect(calls.fetch[0].url).toContain('/models/gemini-2.5-flash:generateContent')
    expect(JSON.parse(calls.fetch[0].options.payload).generationConfig.temperature).toBe(0)
  })

  it.each([
    ['한도 초과(429)', { code: 429, body: '{"error":{"message":"quota"}}' }, 'quota'],
    ['서버 오류(503)', { code: 503, body: 'unavailable' }, 'failed'],
    ['JSON이 아닌 응답', { code: 200, body: geminiBody(FIELDS).replace('{\\"date', 'not json {\\"date') }, 'failed'],
    ['연결 실패', new Error('Address unavailable: test-key'), 'failed'],
  ])('%s이면 Drive 인식으로 바꾼다', (_name, gemini, reason) => {
    const { context, calls } = load({ properties: { GEMINI_API_KEY: 'test-key' }, gemini })
    const result = context.ocrReceipt('AAAA', 'image/jpeg')
    expect(result).toEqual({ engine: 'drive', text: '단가 1,689', tempFileLeft: false, gemini: reason })
    expect(JSON.stringify(result)).not.toContain('test-key')
    expect(calls.driveCreate).toBe(1)
  })

  it('Gemini 값의 형식이 틀리면 null로 바꾼다', () => {
    const { context } = load({
      properties: { GEMINI_API_KEY: 'k' },
      gemini: { code: 200, body: geminiBody({ date: '2026/10/25', unitPrice: '1809', liters: 16, paid: null }) },
    })
    expect(context.ocrReceipt('AAAA', 'image/jpeg').fields).toEqual({ date: null, unitPrice: null, liters: 16, paid: null })
  })

  it('잘못된 모델 이름은 요청하지 않고 Drive로 바꾼다', () => {
    const { context, calls } = load({ properties: { GEMINI_API_KEY: 'k', GEMINI_MODEL: '../x?key=1' }, gemini: { code: 200, body: '' } })
    expect(context.ocrReceipt('AAAA', 'image/jpeg').engine).toBe('drive')
    expect(calls.fetch.some((c) => c.url.includes('generativelanguage'))).toBe(false)
  })

  it('사진 형식·크기를 확인한다', () => {
    const { context } = load()
    expect(() => context.ocrReceipt('', 'image/jpeg')).toThrow('[api]')
    expect(() => context.ocrReceipt('AAAA', 'image/gif')).toThrow('[api]')
  })
})
