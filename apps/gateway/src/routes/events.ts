import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { eventBus } from '../lib/event-bus.js'
import { getStats } from '../lib/request-store.js'

const eventsRoutes = new Hono()

// GET /api/events - SSE endpoint for real-time updates
eventsRoutes.get('/', (c) => {
  return streamSSE(c, async (stream) => {
    // Send initial stats
    const stats = getStats()
    await stream.writeSSE({
      event: 'stats:update',
      data: JSON.stringify(stats),
    })

    // Subscribe to events
    const unsub1 = eventBus.on('request:end', async (data) => {
      try {
        await stream.writeSSE({
          event: 'request:end',
          data: JSON.stringify(data),
        })
      } catch {
        // Client disconnected
      }
    })

    const unsub2 = eventBus.on('stats:update', async (data) => {
      try {
        await stream.writeSSE({
          event: 'stats:update',
          data: JSON.stringify(data),
        })
      } catch {
        // Client disconnected
      }
    })

    // Keep connection alive
    stream.onAbort(() => {
      unsub1()
      unsub2()
    })

    // Send heartbeat every 30 seconds
    while (true) {
      await stream.sleep(30000)
      await stream.writeSSE({ data: '' })
    }
  })
})

export { eventsRoutes }
