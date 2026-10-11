import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const valid = {
  VITE_GOOGLE_CLIENT_ID: 'example.apps.googleusercontent.com',
  VITE_GOOGLE_API_KEY: 'test-only-key',
  VITE_GOOGLE_APP_ID: '123456789',
}

function check(overrides: Partial<typeof valid>) {
  const result = spawnSync(process.execPath, ['scripts/check-deploy-config.mjs'], {
    env: { ...valid, ...overrides },
    encoding: 'utf8',
  })
  if (result.error) throw result.error
  return result
}

describe('deployment configuration check', () => {
  it('accepts the three public settings', () => {
    expect(check({}).status).toBe(0)
  })

  it('rejects missing or whitespace-only settings without printing values', () => {
    for (const name of Object.keys(valid)) {
      const result = check({ [name]: '  ' })
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(name)
      expect(result.stderr).not.toContain(valid.VITE_GOOGLE_API_KEY)
    }
  })

  it('rejects a project ID instead of a number and a malformed client ID', () => {
    expect(check({ VITE_GOOGLE_APP_ID: 'niro-manager' }).status).toBe(1)
    expect(check({ VITE_GOOGLE_CLIENT_ID: 'wrong-client' }).status).toBe(1)
  })
})
