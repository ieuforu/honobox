import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { config } from '../config/index.js'

const key = createHash('sha256').update(config.auth.modelEncryptionKey).digest()

export function hashApiKey(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [iv, authTag, encrypted].map((part) => part.toString('base64url')).join('.')
}

export function decryptSecret(value: string): string {
  const [ivPart, authTagPart, encryptedPart] = value.split('.')
  if (!ivPart || !authTagPart || !encryptedPart) {
    throw new Error('Invalid encrypted secret')
  }

  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64url'))
  decipher.setAuthTag(Buffer.from(authTagPart, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}
