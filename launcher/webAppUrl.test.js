import { describe, expect, it } from 'vitest'
import {
  OPEN_MODE_KEY,
  STORAGE_KEY,
  clearWebAppUrl,
  isSetupRequested,
  loadOpenMode,
  loadWebAppUrl,
  normalizeWebAppUrl,
  saveOpenMode,
  saveWebAppUrl,
} from './webAppUrl.js'

const VALID = 'https://script.google.com/macros/s/AKfycbx_Example-123/exec'

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    data,
  }
}

describe('normalizeWebAppUrl', () => {
  it('accepts an Apps Script /exec deployment URL and trims spaces', () => {
    expect(normalizeWebAppUrl(VALID)).toBe(VALID)
    expect(normalizeWebAppUrl(`  ${VALID}\n`)).toBe(VALID)
  })

  it.each([
    ['http scheme', VALID.replace('https:', 'http:')],
    ['test deployment /dev', VALID.replace('/exec', '/dev')],
    ['query string', `${VALID}?x=1`],
    ['trailing slash', `${VALID}/`],
    ['other host', 'https://script.google.com.evil.example/macros/s/abc/exec'],
    ['lookalike host', 'https://scriptxgoogle.com/macros/s/abc/exec'],
    ['domain-scoped path', 'https://script.google.com/a/macros/example.com/s/abc/exec'],
    ['empty id', 'https://script.google.com/macros/s//exec'],
    ['id with dot', 'https://script.google.com/macros/s/ab.c/exec'],
    ['javascript url', 'javascript:alert(1)'],
    ['empty', ''],
  ])('rejects %s', (_label, value) => {
    expect(normalizeWebAppUrl(value)).toBeNull()
  })

  it('rejects non-strings', () => {
    expect(normalizeWebAppUrl(null)).toBeNull()
    expect(normalizeWebAppUrl(undefined)).toBeNull()
  })
})

describe('storage helpers', () => {
  it('saves only valid URLs', () => {
    const storage = memoryStorage()
    expect(saveWebAppUrl(storage, 'https://example.com/')).toBeNull()
    expect(storage.data.size).toBe(0)
    expect(saveWebAppUrl(storage, ` ${VALID} `)).toBe(VALID)
    expect(storage.data.get(STORAGE_KEY)).toBe(VALID)
  })

  it('ignores a stored value that is not a valid URL', () => {
    expect(loadWebAppUrl(memoryStorage({ [STORAGE_KEY]: 'https://example.com/' }))).toBeNull()
    expect(loadWebAppUrl(memoryStorage({ [STORAGE_KEY]: VALID }))).toBe(VALID)
    expect(loadWebAppUrl(memoryStorage())).toBeNull()
  })

  it('treats an unavailable storage as empty', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    expect(loadWebAppUrl(broken)).toBeNull()
    expect(() => clearWebAppUrl(broken)).not.toThrow()
  })

  it('clears the stored URL', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: VALID })
    clearWebAppUrl(storage)
    expect(loadWebAppUrl(storage)).toBeNull()
  })
})

describe('isSetupRequested', () => {
  it('is true only for setup=1', () => {
    expect(isSetupRequested('?setup=1')).toBe(true)
    expect(isSetupRequested('?a=b&setup=1')).toBe(true)
    expect(isSetupRequested('')).toBe(false)
    expect(isSetupRequested('?setup=0')).toBe(false)
  })
})

describe('open mode', () => {
  it('defaults to embed when nothing or an unknown value is stored', () => {
    expect(loadOpenMode(memoryStorage())).toBe('embed')
    expect(loadOpenMode(memoryStorage({ [OPEN_MODE_KEY]: 'popup' }))).toBe('embed')
    expect(
      loadOpenMode({
        getItem: () => {
          throw new Error('blocked')
        },
      }),
    ).toBe('embed')
  })

  it('saves only known modes', () => {
    const storage = memoryStorage()
    expect(saveOpenMode(storage, 'popup')).toBeNull()
    expect(storage.data.size).toBe(0)
    expect(saveOpenMode(storage, 'direct')).toBe('direct')
    expect(loadOpenMode(storage)).toBe('direct')
    expect(saveOpenMode(storage, 'embed')).toBe('embed')
    expect(loadOpenMode(storage)).toBe('embed')
  })
})
