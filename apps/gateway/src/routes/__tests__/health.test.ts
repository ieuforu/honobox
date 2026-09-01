import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import healthRoutes from '../health'

// Mock database
vi.mock('../../db/index.js', () => ({
  db: {
    execute: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
  },
}))

const app = new Hono()
app.route('/health', healthRoutes)

describe('health route', () => {
  it('GET /health should return status', async () => {
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe('ok')
    expect(data.database).toBe('connected')
    expect(data.timestamp).toBeDefined()
  })
})
