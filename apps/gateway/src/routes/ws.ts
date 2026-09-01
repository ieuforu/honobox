import { Hono } from 'hono'
import { createNodeWebSocket } from '@hono/node-ws'
import { eventBus, type RequestEvent, type StatsEvent } from '../lib/event-bus'
import { getStats } from '../lib/request-store'

const wsRoutes = new Hono()

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app: wsRoutes })

wsRoutes.get('/events', upgradeWebSocket((c) => {
  let cleanup: (() => void)[] = []

  return {
    onOpen(_event, ws) {
      // Send initial stats
      const stats = getStats()
      ws.send(JSON.stringify({ type: 'stats:update', data: stats }))

      // Subscribe to events
      const unsub1 = eventBus.on('request:end', (data: RequestEvent['data']) => {
        ws.send(JSON.stringify({ type: 'request:end', data }))
      })

      const unsub2 = eventBus.on('stats:update', (data: StatsEvent['data']) => {
        ws.send(JSON.stringify({ type: 'stats:update', data }))
      })

      cleanup.push(unsub1, unsub2)
    },

    onClose() {
      cleanup.forEach(fn => fn())
      cleanup = []
    },

    onError(event) {
      console.error('WebSocket error:', event)
      cleanup.forEach(fn => fn())
      cleanup = []
    },
  }
}))

export { wsRoutes, injectWebSocket }
