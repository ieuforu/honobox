import { describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import type { Variables } from '../../types/index.js'

const keyRecord = {
  id: 'key-id',
  name: 'test',
  keyHash: 'hash',
  keyPrefix: 'sk-test',
  enabled: true,
  rateLimit: 42,
}

vi.mock('../../lib/secrets.js', () => ({ hashApiKey: () => 'hash' }))
vi.mock('../../db/schema/index.js', () => ({ apiKeys: { keyHash: {}, id: {} } }))
vi.mock('../../db/index.js', () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([keyRecord]) }) }),
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  },
}))

import { authMiddleware } from '../auth.js'

describe('authMiddleware', () => {
  const app = new Hono<{ Variables: Variables }>()
  app.use('*', authMiddleware)
  app.get('/', (c) => c.json({ keyId: c.get('apiKeyId'), rateLimit: c.get('rateLimit') }))

  it('requires a bearer key', async () => {
    expect((await app.request('/')).status).toBe(401)
  })

  it('loads key policy into the request context', async () => {
    const response = await app.request('/', {
      headers: { Authorization: 'Bearer sk-test-value' },
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ keyId: 'key-id', rateLimit: 42 })
  })
})
