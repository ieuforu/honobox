import { getAdminToken } from './api'

// SSE client for real-time updates - singleton

type EventHandler = (data: any) => void

class SSEClient {
  private abortController: AbortController | null = null
  private handlers = new Map<string, Set<EventHandler>>()
  private connected = false

  connect() {
    if (this.connected) return
    this.connected = true

    this.abortController = new AbortController()
    void this.consume(this.abortController.signal)
  }

  private async consume(signal: AbortSignal) {
    try {
      const token = getAdminToken()
      const response = await fetch('/api/events', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal,
      })
      if (!response.ok || !response.body) throw new Error(`SSE failed (${response.status})`)

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (!signal.aborted) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const messages = buffer.split('\n\n')
        buffer = messages.pop() ?? ''
        for (const message of messages) this.dispatch(message)
      }
    } catch (error) {
      if (!signal.aborted) console.error('SSE disconnected:', error)
    } finally {
      if (!signal.aborted) {
        this.connected = false
        setTimeout(() => this.connect(), 3000)
      }
    }
  }

  private dispatch(message: string) {
    let eventType = 'message'
    const data: string[] = []
    for (const line of message.split('\n')) {
      if (line.startsWith('event:')) eventType = line.slice(6).trim()
      if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
    }
    if (data.length === 0 || !this.handlers.has(eventType)) return
    try {
      const payload = JSON.parse(data.join('\n'))
      this.handlers.get(eventType)?.forEach((handler) => handler(payload))
    } catch (error) {
      console.error('Failed to parse SSE data:', error)
    }
  }

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event)!.add(handler)
    return () => this.handlers.get(event)?.delete(handler)
  }

  disconnect() {
    this.abortController?.abort()
    this.abortController = null
    this.connected = false
  }
}

export const sseClient = new SSEClient()
