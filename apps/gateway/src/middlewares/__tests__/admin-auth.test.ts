import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'

vi.mock('../../config/index.js', () => ({
  config: { auth: { adminToken: 'admin-secret' } },
}))

import { adminAuthMiddleware } from '../admin-auth.js'

describe('adminAuthMiddleware', () => {
  const app = new Hono()
  app.use('*', adminAuthMiddleware)
  app.get('/', (c) => c.json({ ok: true }))

  beforeEach(() => vi.clearAllMocks())

  it('rejects a missing token', async () => {
    expect((await app.request('/')).status).toBe(401)
  })

  it('rejects an invalid token', async () => {
    const response = await app.request('/', {
      headers: { Authorization: 'Bearer wrong' },
    })
    expect(response.status).toBe(401)
  })

  it('accepts the configured token', async () => {
    const response = await app.request('/', {
      headers: { Authorization: 'Bearer admin-secret' },
    })
    expect(response.status).toBe(200)
  })
})
