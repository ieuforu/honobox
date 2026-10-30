export interface TraceEvent {
  kind: string
  ms: number
  data?: string
}
export interface Trace {
  id: string
  startedAt: string
  model: string
  source: 'lab' | 'live'
  scenario?: string
  status: string
  httpStatus: number
  durationMs: number
  firstOutputMs: number | null
  request?: unknown
  response?: string
  error?: string
  events?: TraceEvent[]
  truncated: boolean
}

export function assembleOutput(events: TraceEvent[] = []) {
  let text = ''
  const tools = new Map<number, { name: string; arguments: string; id: string }>()
  for (const event of events) {
    if (event.kind !== 'tool_delta' && event.kind !== 'chunk') continue
    try {
      const chunk = JSON.parse(event.data ?? '{}')
      for (const choice of chunk.choices ?? []) {
        if ((choice.index ?? 0) !== 0) continue
        text += choice.delta?.content ?? ''
        for (const call of choice.delta?.tool_calls ?? []) {
          const item = tools.get(call.index) ?? { name: '', arguments: '', id: '' }
          item.name += call.function?.name ?? ''
          item.arguments += call.function?.arguments ?? ''
          if (call.id) item.id = call.id
          tools.set(call.index, item)
        }
      }
    } catch {
      /* Raw events remain available if a provider sends an unknown shape. */
    }
  }
  return { text, tools: [...tools.values()] }
}
