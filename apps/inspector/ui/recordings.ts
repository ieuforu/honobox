import type { Trace, TraceEvent } from './types'

export const snapshotLimit = 1024 * 1024
const statuses = new Set(['running', 'completed', 'failed', 'interrupted', 'timeout', 'cancelled'])
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const number = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

// This envelope is data, never an instruction to send a model request or execute a tool.
export function readSnapshot(input: string): Trace {
  if (new TextEncoder().encode(input).length > snapshotLimit)
    throw new Error('Snapshot exceeds the 1 MiB limit.')
  let envelope: unknown
  try {
    envelope = JSON.parse(input)
  } catch {
    throw new Error('Enter a valid JSON snapshot.')
  }
  // JSON.parse accepts deeply nested data that pretty-printing cannot serialize safely.
  const pending: { value: unknown; depth: number }[] = [{ value: envelope, depth: 0 }]
  while (pending.length) {
    const item = pending.pop()!
    if (item.depth > 64) throw new Error('Snapshot exceeds the 64-level nesting limit.')
    if (item.value !== null && typeof item.value === 'object')
      for (const child of Object.values(item.value))
        pending.push({ value: child, depth: item.depth + 1 })
  }
  if (!object(envelope) || envelope.format !== 'honobox-trace' || envelope.version !== 1)
    throw new Error('Expected a HonoBox trace snapshot, version 1.')
  const value = envelope.trace
  if (
    !object(value) ||
    typeof value.id !== 'string' ||
    !value.id ||
    value.id.length > 200 ||
    typeof value.model !== 'string' ||
    !value.model ||
    value.model.length > 200 ||
    typeof value.startedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.startedAt)) ||
    typeof value.source !== 'string' ||
    !['lab', 'live'].includes(value.source) ||
    typeof value.status !== 'string' ||
    !statuses.has(value.status) ||
    !number(value.httpStatus) ||
    !Number.isInteger(value.httpStatus) ||
    value.httpStatus > 599 ||
    !number(value.durationMs) ||
    (value.firstOutputMs !== null && !number(value.firstOutputMs)) ||
    (typeof value.firstOutputMs === 'number' && value.firstOutputMs > value.durationMs) ||
    typeof value.truncated !== 'boolean' ||
    !Array.isArray(value.events) ||
    value.events.length > 300
  )
    throw new Error('Snapshot has invalid trace metadata or more than 300 events.')
  let previous = 0
  for (const event of value.events) {
    if (
      !object(event) ||
      typeof event.kind !== 'string' ||
      !event.kind ||
      event.kind.length > 80 ||
      !number(event.ms) ||
      event.ms < previous ||
      event.ms > value.durationMs ||
      (event.data !== undefined && typeof event.data !== 'string')
    )
      throw new Error('Events must contain ordered, nonnegative timestamps and text data.')
    previous = event.ms
  }
  for (const key of ['response', 'error', 'scenario'])
    if (value[key] !== undefined && typeof value[key] !== 'string')
      throw new Error(`Snapshot ${key} must be text.`)
  // Copy only the documented fields; unknown fields cannot become UI configuration.
  return {
    id: value.id,
    model: value.model,
    startedAt: value.startedAt,
    source: value.source as Trace['source'],
    status: String(value.status),
    httpStatus: value.httpStatus,
    durationMs: value.durationMs,
    firstOutputMs: value.firstOutputMs as number | null,
    truncated: value.truncated,
    events: value.events.map((e) => ({ kind: e.kind, ms: e.ms, data: e.data })),
    request: value.request,
    response: value.response as string | undefined,
    error: value.error as string | undefined,
    scenario: value.scenario as string | undefined,
  }
}

export function writeSnapshot(trace: Trace): string {
  const json = JSON.stringify({ format: 'honobox-trace', version: 1, trace }, null, 2)
  readSnapshot(json)
  return json
}

export function traceAtEvent(trace: Trace, count: number): Trace {
  const events = trace.events ?? []
  if (count >= events.length) return trace
  const shown = events.slice(0, Math.max(0, count))
  return {
    ...trace,
    events: shown,
    status: 'running',
    error: undefined,
    durationMs: shown.at(-1)?.ms ?? 0,
    httpStatus: shown.some((e) => e.kind === 'upstream_headers') ? trace.httpStatus : 0,
    firstOutputMs: shown.find((e) => e.kind === 'first_output')?.ms ?? null,
    // Captured byte boundaries differ from parsed event boundaries. Never reconstruct raw SSE.
    response: '',
  }
}

const delta = (value: unknown) => JSON.stringify({ choices: [{ index: 0, delta: value }] })
function sample(scenario: string, status: string, events: TraceEvent[], error?: string): Trace {
  const response =
    events
      .filter((e) => ['chunk', 'tool_delta'].includes(e.kind))
      .map((e) => `data: ${e.data}\n\n`)
      .join('') + (status === 'completed' ? 'data: [DONE]\n\n' : '')
  return {
    id: `sample-${scenario}`,
    startedAt: '2026-11-02T00:00:00.000Z',
    model: 'honobox-offline',
    source: 'lab',
    scenario,
    status,
    httpStatus: scenario === 'timeout' ? 504 : scenario === 'upstream-error' ? 503 : 200,
    durationMs: events.at(-1)?.ms ?? 0,
    firstOutputMs: events.find((e) => e.kind === 'first_output')?.ms ?? null,
    truncated: false,
    error,
    events,
    response,
    request: {
      model: 'honobox-offline',
      stream: true,
      messages: [{ role: 'user', content: 'Synthetic example: show the weather in Shanghai.' }],
    },
  }
}
const received = { kind: 'received', ms: 0, data: 'Synthetic request accepted' }
const headers = { kind: 'upstream_headers', ms: 40, data: 'OK' }
const first = { kind: 'first_output', ms: 120, data: 'First content or tool-call delta' }
export const sampleTraces: Trace[] = [
  sample('tool-call', 'completed', [
    received,
    headers,
    first,
    ...['{"city":', '"Shang', 'hai"}'].map((arguments_, i) => ({
      kind: 'tool_delta',
      ms: 120 + i * 120,
      data: delta({
        tool_calls: [
          {
            index: 0,
            ...(i === 0 ? { id: 'call_sample', type: 'function' } : {}),
            function: { ...(i === 0 ? { name: 'get_weather' } : {}), arguments: arguments_ },
          },
        ],
      }),
    })),
    { kind: 'finish_reason', ms: 480, data: 'tool_calls' },
    { kind: 'done', ms: 481, data: 'Provider sent [DONE]' },
    {
      kind: 'completed',
      ms: 482,
      data: 'Stream finished; the application has not executed the tool.',
    },
  ]),
  sample(
    'interrupted',
    'interrupted',
    [
      received,
      headers,
      first,
      { kind: 'chunk', ms: 120, data: delta({ content: 'The stream ' }) },
      { kind: 'chunk', ms: 240, data: delta({ content: 'stopped here…' }) },
      { kind: 'interrupted', ms: 360, data: 'Stream ended without [DONE]' },
    ],
    'Stream ended without [DONE]',
  ),
  sample(
    'slow',
    'cancelled',
    [
      received,
      headers,
      first,
      { kind: 'chunk', ms: 120, data: delta({ content: 'Partial output before cancellation.' }) },
      { kind: 'cancelled', ms: 920, data: 'Client disconnected; upstream request cancelled' },
    ],
    'Client disconnected; upstream request cancelled',
  ),
  sample(
    'upstream-error',
    'failed',
    [
      received,
      { kind: 'upstream_headers', ms: 60, data: 'Service Unavailable' },
      { kind: 'failed', ms: 61, data: 'Upstream returned HTTP 503 Service Unavailable' },
    ],
    'Upstream returned HTTP 503 Service Unavailable',
  ),
  sample(
    'timeout',
    'timeout',
    [received, { kind: 'timeout', ms: 700, data: 'Upstream response timed out before headers' }],
    'Upstream response timed out before headers',
  ),
]

export function observation(trace: Trace): string {
  if (trace.truncated)
    return 'This capture is partial. Missing events alone cannot prove an upstream failure.'
  if (trace.status === 'interrupted')
    return 'HTTP 200 confirms the response started. The missing [DONE] marker explains why this stream is incomplete.'
  if (trace.status === 'cancelled')
    return 'The client ended the request. Inspect the output received before cancellation; it is intentionally partial.'
  if (trace.status === 'timeout')
    return 'The deadline expired. Check whether headers and first output arrived to locate the waiting stage.'
  if (trace.status === 'failed')
    return 'Inspect the HTTP status and provider error together. A successful connection can still contain a stream error.'
  if (trace.events?.some((e) => e.kind === 'tool_delta'))
    return 'Arguments arrive as fragments. A fragment may be invalid JSON until the call finishes; the gateway does not execute the requested tool.'
  return 'Step through the recorded events to compare transport state with the assembled output.'
}
