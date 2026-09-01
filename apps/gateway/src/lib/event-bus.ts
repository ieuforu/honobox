// Simple in-memory event bus for WebSocket broadcasting

type EventHandler = (data: any) => void

class EventBus {
  private handlers = new Map<string, Set<EventHandler>>()

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event)!.add(handler)
    return () => this.handlers.get(event)?.delete(handler)
  }

  emit(event: string, data: any): void {
    this.handlers.get(event)?.forEach(handler => handler(data))
  }
}

export const eventBus = new EventBus()

// Event types
export interface RequestEvent {
  type: 'request:start' | 'request:end'
  data: {
    id: string
    requestId: string
    model: string
    timestamp: string
    latencyMs?: number
    statusCode?: number
    totalTokens?: number
    status?: string
  }
}

export interface StatsEvent {
  type: 'stats:update'
  data: {
    totalRequests: number
    totalTokens: number
    avgLatencyMs: number
    errorRate: number
  }
}
