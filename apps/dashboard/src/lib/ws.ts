// WebSocket client for real-time updates

type EventHandler = (data: any) => void

class WebSocketClient {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<EventHandler>>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws/events`

    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      console.log('WebSocket connected')
    }

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type) {
          this.handlers.get(data.type)?.forEach(handler => handler(data.data))
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err)
      }
    }

    this.ws.onclose = () => {
      console.log('WebSocket disconnected, reconnecting...')
      this.scheduleReconnect()
    }

    this.ws.onerror = (err) => {
      console.error('WebSocket error:', err)
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 3000)
  }

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event)!.add(handler)
    return () => this.handlers.get(event)?.delete(handler)
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
    this.ws = null
  }
}

export const wsClient = new WebSocketClient()
