import { describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret, hashApiKey } from '../secrets.js'

describe('secret handling', () => {
  it('hashes API keys without storing the plaintext', () => {
    const value = 'sk-test-value'
    expect(hashApiKey(value)).toHaveLength(64)
    expect(hashApiKey(value)).toBe(hashApiKey(value))
    expect(hashApiKey(value)).not.toContain(value)
  })

  it('encrypts provider keys with a randomized IV', () => {
    const value = 'provider-secret'
    const first = encryptSecret(value)
    const second = encryptSecret(value)
    expect(first).not.toBe(second)
    expect(decryptSecret(first)).toBe(value)
    expect(decryptSecret(second)).toBe(value)
  })
})
