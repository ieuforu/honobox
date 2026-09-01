import { describe, it, expect, beforeEach } from 'vitest'
import { addRequestLog, getRequestLogs, getStats, type RequestLogEntry } from '../request-store'

describe('request-store', () => {
  beforeEach(() => {
    // Clear store by getting all logs and noting count
    const logs = getRequestLogs(1000)
    // We can't directly clear, but tests should be independent
  })

  const createLog = (overrides?: Partial<RequestLogEntry>): RequestLogEntry => ({
    id: `id-${Date.now()}`,
    traceId: 'trace-123',
    requestId: 'req-123',
    model: 'gpt-4o',
    latencyMs: 100,
    statusCode: 200,
    promptTokens: 10,
    completionTokens: 20,
    error: null,
    timestamp: new Date().toISOString(),
    ...overrides,
  })

  describe('addRequestLog', () => {
    it('should add a log entry', () => {
      const log = createLog()
      addRequestLog(log)
      const logs = getRequestLogs(1)
      expect(logs[0].id).toBe(log.id)
    })
  })

  describe('getRequestLogs', () => {
    it('should return logs in reverse chronological order', () => {
      const log1 = createLog({ id: 'log-1' })
      const log2 = createLog({ id: 'log-2' })
      addRequestLog(log1)
      addRequestLog(log2)
      const logs = getRequestLogs(2)
      expect(logs[0].id).toBe('log-2')
      expect(logs[1].id).toBe('log-1')
    })

    it('should respect limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        addRequestLog(createLog({ id: `log-${i}` }))
      }
      const logs = getRequestLogs(3)
      expect(logs.length).toBeLessThanOrEqual(3)
    })
  })

  describe('getStats', () => {
    it('should calculate total requests', () => {
      const before = getStats().totalRequests
      addRequestLog(createLog())
      addRequestLog(createLog())
      const after = getStats().totalRequests
      expect(after).toBe(before + 2)
    })

    it('should calculate total tokens', () => {
      const before = getStats().totalTokens
      addRequestLog(createLog({ promptTokens: 100, completionTokens: 50 }))
      const after = getStats().totalTokens
      expect(after).toBe(before + 150)
    })

    it('should calculate error rate', () => {
      addRequestLog(createLog({ statusCode: 200 }))
      addRequestLog(createLog({ statusCode: 500 }))
      const stats = getStats()
      expect(stats.errorRate).toBeGreaterThan(0)
    })

    it('should group by model', () => {
      addRequestLog(createLog({ model: 'gpt-4o' }))
      addRequestLog(createLog({ model: 'claude-3' }))
      const stats = getStats()
      expect(stats.byModel['gpt-4o']).toBeDefined()
      expect(stats.byModel['claude-3']).toBeDefined()
    })
  })
})
