// SSE client for real-time updates

type EventHandler = (data: any) => void

class SSEClient {
  private eventSource: EventSource | null = null
  private handlers = new Map<string, Set<EventHandler>>()

  connect() {
    this.eventSource = new EventSource('/api/events')

    this.eventSource.onopen = () => {
      console.log('SSE connected')
    }

    this.eventSource.onerror = () => {
      console.log('SSE disconnected, reconnecting...')
    }

    // Listen for named events
    const eventTypes = ['stats:update', 'request:end']
    eventTypes.forEach(type => {
      this.eventSource!.addEventListener(type, (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data)
          this.handlers.get(type)?.forEach(handler => handler(data))
        } catch (err) {
          console.error('Failed to parse SSE data:', err)
        }
      })
    })
  }

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event)!.add(handler)
    return () => this.handlers.get(event)?.delete(handler)
  }

  disconnect() {
    this.eventSource?.close()
    this.eventSource = null
  }
}

export const sseClient = new SSEClient()
