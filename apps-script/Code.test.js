// apps-script/Code.js를 Apps Script 서비스 가짜 구현과 함께 불러 영수증 인식 흐름을 확인한다.
// 실제 Gemini·Drive는 부르지 않는다.
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const SOURCE = readFileSync(new URL('./Code.js', import.meta.url), 'utf8')

/**
 * gemini: generateContent 응답 { code, body } 또는 던질 Error. 모델별로 다르게 하려면 (model) => 응답.
 * models: 모델 목록(GET v1beta/models) 응답 { code, body }(없으면 404).
 * fetchMs: Gemini 요청 한 번에 흐르는 가짜 시간(ms). Utilities.sleep도 가짜 시계를 그만큼 앞당긴다.
 */
function load({
  properties = {},
  gemini,
  models = { code: 404, body: '' },
  cache = {},
  drive = { text: '단가 1,689', exportCode: 200 },
  fetchMs = 0,
} = {}) {
  const calls = { fetch: [], driveCreate: 0, driveRemove: 0, cachePut: [], sleep: [] }
  const clock = { now: 1_000_000 }
  const response = (code, body) => ({ getResponseCode: () => code, getContentText: () => body })
  const context = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in properties ? properties[k] : null) }) },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (k in cache ? cache[k] : null),
        put: (k, v, seconds) => {
          cache[k] = v
          calls.cachePut.push([k, v, seconds])
        },
        remove: (k) => delete cache[k],
      }),
    },
    UrlFetchApp: {
      fetch(url, options) {
        calls.fetch.push({ url, options })
        if (url.startsWith('https://generativelanguage.googleapis.com/v1beta/models?')) return response(models.code, models.body)
        if (url.startsWith('https://generativelanguage.googleapis.com/')) {
          const model = /models\/([^:]+):generateContent/.exec(url)[1]
          clock.now += fetchMs
          const result = typeof gemini === 'function' ? gemini(model, calls) : gemini
          if (result instanceof Error) throw result
          return response(result.code, result.body)
        }
        return response(drive.exportCode, drive.text)
      },
    },
    Utilities: {
      newBlob: () => ({}),
      base64Decode: () => [],
      sleep: (ms) => {
        calls.sleep.push(ms)
        clock.now += ms
      },
    },
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
  context.geminiNow_ = () => clock.now
  return { context, calls, clock }
}

const geminiBody = (fields) => JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(fields) }] } }] })
const FIELDS = { date: '2026-10-25', unitPrice: 1809, liters: 16, paid: 28944 }

describe('ocrReceipt (Apps Script 서버)', () => {
  it('키가 없으면 Drive 인식을 쓰고 임시 문서를 지운다', () => {
    const { context, calls } = load()
    expect(context.ocrReceipt('AAAA', 'image/jpeg')).toEqual({ engine: 'drive', text: '단가 1,689', tempFileLeft: false, gemini: 'no-key', geminiStatus: null })
    expect(calls.fetch.some((c) => c.url.includes('generativelanguage'))).toBe(false)
    expect([calls.driveCreate, calls.driveRemove]).toEqual([1, 1])
  })

  it('키가 있으면 Gemini로 읽고 Drive는 쓰지 않는다', () => {
    const { context, calls } = load({ properties: { GEMINI_API_KEY: 'test-key' }, gemini: { code: 200, body: geminiBody(FIELDS) } })
    expect(context.ocrReceipt('AAAA', 'image/jpeg')).toEqual({ engine: 'gemini', fields: FIELDS, model: 'gemini-3.8-flash', text: '', tempFileLeft: false })
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
    ['한도 초과(429)', { code: 429, body: '{"error":{"message":"quota test-key"}}' }, 'quota', 429],
    ['서버 오류(503, 재시도·대체 모델 모두 실패)', { code: 503, body: 'unavailable test-key' }, 'failed', 503],
    ['키 오류(400)', { code: 400, body: '{"error":{"message":"API key not valid"}}' }, 'failed', 400],
    ['JSON이 아닌 응답', { code: 200, body: geminiBody(FIELDS).replace('{\\"date', 'not json {\\"date') }, 'failed', 200],
    ['연결 실패', new Error('Address unavailable: test-key'), 'network', null],
  ])('%s이면 Drive 인식으로 바꾸고 상태 코드만 알린다', (_name, gemini, reason, status) => {
    const { context, calls } = load({ properties: { GEMINI_API_KEY: 'test-key' }, gemini })
    const result = context.ocrReceipt('AAAA', 'image/jpeg')
    expect(result).toEqual({ engine: 'drive', text: '단가 1,689', tempFileLeft: false, gemini: reason, geminiStatus: status })
    expect(JSON.stringify(result)).not.toContain('test-key')
    expect(calls.driveCreate).toBe(1)
  })

  const busyList = {
    code: 200,
    body: JSON.stringify({
      models: [
        { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.8-flash-lite', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.8-pro', supportedGenerationMethods: ['generateContent'] },
      ],
    }),
  }
  const generateUrls = (calls) => calls.fetch.filter((c) => c.url.includes(':generateContent')).map((c) => /models\/([^:]+):/.exec(c.url)[1])

  it('503이면 1초 쉬고 같은 모델로 다시 시도해 성공한다', () => {
    let n = 0
    const { context, calls } = load({
      properties: { GEMINI_API_KEY: 'k' },
      gemini: () => (++n === 1 ? { code: 503, body: '' } : { code: 200, body: geminiBody(FIELDS) }),
    })
    expect(context.ocrReceipt('AAAA', 'image/jpeg')).toEqual({ engine: 'gemini', fields: FIELDS, model: 'gemini-3.8-flash', text: '', tempFileLeft: false })
    expect(calls.sleep).toEqual([1000])
    expect(generateUrls(calls)).toEqual(['gemini-3.8-flash', 'gemini-3.8-flash'])
    expect(calls.driveCreate).toBe(0)
  })

  it.each([500, 502, 504])('%i도 재시도한다', (code) => {
    let n = 0
    const { context, calls } = load({
      properties: { GEMINI_API_KEY: 'k' },
      gemini: () => (++n === 1 ? { code, body: '' } : { code: 200, body: geminiBody(FIELDS) }),
    })
    expect(context.ocrReceipt('AAAA', 'image/jpeg').engine).toBe('gemini')
    expect(calls.sleep).toEqual([1000])
  })

  it('같은 모델이 세 번 모두 503이면 목록에서 고른 다른 Flash 계열 모델로 한 번 시도해 성공한다(캐시하지 않음)', () => {
    const { context, calls } = load({
      properties: { GEMINI_API_KEY: 'k' },
      gemini: (model) => (model === 'gemini-3.8-flash' ? { code: 503, body: '' } : { code: 200, body: geminiBody(FIELDS) }),
      models: busyList,
    })
    expect(context.ocrReceipt('AAAA', 'image/jpeg')).toEqual({ engine: 'gemini', fields: FIELDS, model: 'gemini-3.8-flash-lite', text: '', tempFileLeft: false })
    expect(calls.sleep).toEqual([1000, 2000])
    expect(generateUrls(calls)).toEqual(['gemini-3.8-flash', 'gemini-3.8-flash', 'gemini-3.8-flash', 'gemini-3.8-flash-lite'])
    expect(calls.cachePut).toEqual([])
  })

  it('lite가 없으면 이전 버전 Flash를 대체 모델로 쓴다', () => {
    const list = { code: 200, body: JSON.stringify({ models: [{ name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] }] }) }
    const { context } = load({
      properties: { GEMINI_API_KEY: 'k' },
      gemini: (model) => (model === 'gemini-3.5-flash' ? { code: 200, body: geminiBody(FIELDS) } : { code: 503, body: '' }),
      models: list,
    })
    expect(context.ocrReceipt('AAAA', 'image/jpeg').model).toBe('gemini-3.5-flash')
  })

  it('대체 모델까지 5xx면 Drive 인식으로 바꾸고 마지막 상태 코드를 알린다', () => {
    const { context, calls } = load({
      properties: { GEMINI_API_KEY: 'k' },
      gemini: (model) => (model === 'gemini-3.8-flash' ? { code: 503, body: '' } : { code: 502, body: '' }),
      models: busyList,
    })
    expect(context.ocrReceipt('AAAA', 'image/jpeg')).toEqual({ engine: 'drive', text: '단가 1,689', tempFileLeft: false, gemini: 'failed', geminiStatus: 502 })
    expect(generateUrls(calls)).toHaveLength(4)
    expect(calls.driveCreate).toBe(1)
  })

  it('GEMINI_MODEL을 지정했으면 재시도만 하고 대체 모델은 쓰지 않는다', () => {
    const { context, calls } = load({ properties: { GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-3.8-flash' }, gemini: { code: 503, body: '' }, models: busyList })
    expect(context.ocrReceipt('AAAA', 'image/jpeg')).toMatchObject({ engine: 'drive', gemini: 'failed', geminiStatus: 503 })
    expect(generateUrls(calls)).toEqual(['gemini-3.8-flash', 'gemini-3.8-flash', 'gemini-3.8-flash'])
    expect(calls.fetch.some((c) => c.url.includes('/models?'))).toBe(false)
  })

  it('429·400은 재시도하지 않는다', () => {
    for (const code of [429, 400]) {
      const { context, calls } = load({ properties: { GEMINI_API_KEY: 'k' }, gemini: { code, body: '' }, models: busyList })
      expect(context.ocrReceipt('AAAA', 'image/jpeg')).toMatchObject({ engine: 'drive', geminiStatus: code })
      expect(calls.sleep).toEqual([])
      expect(generateUrls(calls)).toHaveLength(1)
    }
  })

  it('요청이 느리면 약 20초를 넘겨 새 시도·대기를 시작하지 않는다', () => {
    const { context, calls, clock } = load({ properties: { GEMINI_API_KEY: 'k' }, gemini: { code: 503, body: '' }, models: busyList, fetchMs: 8000 })
    const start = clock.now
    expect(context.ocrReceipt('AAAA', 'image/jpeg')).toMatchObject({ engine: 'drive', gemini: 'failed', geminiStatus: 503 })
    // 8초 요청 → 1초 대기 → 8초 요청(17초). 2초 대기 + 8초 요청이면 27초라 더 시도하지 않고, 대체 모델(17+8초)도 시작하지 않는다.
    expect(generateUrls(calls)).toEqual(['gemini-3.8-flash', 'gemini-3.8-flash'])
    expect(calls.sleep).toEqual([1000])
    expect(calls.fetch.some((c) => c.url.includes('/models?'))).toBe(false)
    expect(clock.now - start).toBeLessThanOrEqual(20000)
  })

  it('남은 시간이 있으면 대체 모델까지 시도하되 시작 시점은 20초 안이다', () => {
    const { context, calls } = load({ properties: { GEMINI_API_KEY: 'k' }, gemini: { code: 503, body: '' }, models: busyList, fetchMs: 4000 })
    context.ocrReceipt('AAAA', 'image/jpeg')
    // 4+1+4+2+4 = 15초 뒤 대체 모델 시작(끝나면 19초)
    expect(generateUrls(calls)).toEqual(['gemini-3.8-flash', 'gemini-3.8-flash', 'gemini-3.8-flash', 'gemini-3.8-flash-lite'])
  })

  it('기본 모델이 없으면(404) 모델 목록에서 가장 새 Flash를 골라 한 번 더 시도하고 6시간 캐시한다', () => {
    const list = {
      models: [
        { name: 'models/gemini-3.1-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.10-flash', supportedGenerationMethods: ['generateContent', 'countTokens'] },
        { name: 'models/gemini-3.9-flash-lite', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-4.0-flash-preview', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-4-flash-image', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-5-flash', supportedGenerationMethods: ['embedContent'] },
        { name: 'models/gemini-3.9-pro', supportedGenerationMethods: ['generateContent'] },
      ],
    }
    const { context, calls } = load({
      properties: { GEMINI_API_KEY: 'test-key' },
      gemini: (model) => (model === 'gemini-3.10-flash' ? { code: 200, body: geminiBody(FIELDS) } : { code: 404, body: 'not found' }),
      models: { code: 200, body: JSON.stringify(list) },
    })
    expect(context.ocrReceipt('AAAA', 'image/jpeg')).toEqual({ engine: 'gemini', fields: FIELDS, model: 'gemini-3.10-flash', text: '', tempFileLeft: false })
    const urls = calls.fetch.map((c) => c.url)
    expect(urls).toEqual([
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
      'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.10-flash:generateContent',
    ])
    expect(calls.fetch[1].options.headers).toEqual({ 'x-goog-api-key': 'test-key' })
    expect(calls.cachePut).toEqual([['GEMINI_RESOLVED_MODEL', 'gemini-3.10-flash', 21600]])
    expect(calls.driveCreate).toBe(0)
  })

  it('캐시한 모델이 있으면 그 모델을 먼저 쓴다', () => {
    const { context, calls } = load({
      properties: { GEMINI_API_KEY: 'k' },
      cache: { GEMINI_RESOLVED_MODEL: 'gemini-3.10-flash' },
      gemini: { code: 200, body: geminiBody(FIELDS) },
    })
    expect(context.ocrReceipt('AAAA', 'image/jpeg').model).toBe('gemini-3.10-flash')
    expect(calls.fetch).toHaveLength(1)
  })

  it('404인데 목록에서 다른 모델을 못 찾으면 Drive로 바꾸고 404를 알린다', () => {
    const { context, calls } = load({
      properties: { GEMINI_API_KEY: 'k' },
      gemini: { code: 404, body: 'not found' },
      models: { code: 200, body: JSON.stringify({ models: [{ name: 'models/gemini-3.8-flash-lite', supportedGenerationMethods: ['generateContent'] }] }) },
    })
    expect(context.ocrReceipt('AAAA', 'image/jpeg')).toMatchObject({ engine: 'drive', gemini: 'failed', geminiStatus: 404 })
    expect(calls.fetch.filter((c) => c.url.includes(':generateContent'))).toHaveLength(1)
    expect(calls.cachePut).toEqual([])
  })

  it('GEMINI_MODEL을 정했으면 404여도 다른 모델로 바꾸지 않는다', () => {
    const { context, calls } = load({ properties: { GEMINI_API_KEY: 'k', GEMINI_MODEL: 'gemini-9-flash' }, gemini: { code: 404, body: '' } })
    expect(context.ocrReceipt('AAAA', 'image/jpeg')).toMatchObject({ engine: 'drive', gemini: 'failed', geminiStatus: 404 })
    expect(calls.fetch.some((c) => c.url.includes('/models?'))).toBe(false)
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
