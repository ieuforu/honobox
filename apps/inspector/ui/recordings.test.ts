import { describe, expect, it } from 'vitest'
import { assembleOutput } from './types'
import {
  readSnapshot,
  sampleTraces,
  snapshotLimit,
  traceAtEvent,
  writeSnapshot,
} from './recordings'

describe('portable recordings', () => {
  it('round trips synthetic scenarios and preserves HTTP success with stream failure', () => {
    for (const trace of sampleTraces) expect(readSnapshot(writeSnapshot(trace))).toEqual(trace)
    const broken = readSnapshot(writeSnapshot(sampleTraces[1]))
    expect(broken.httpStatus).toBe(200)
    expect(broken.status).toBe('interrupted')
  })
  it('rejects wrong versions, malformed fields, oversized captures and unordered events', () => {
    expect(() => readSnapshot('bad json')).toThrow('JSON')
    expect(() => readSnapshot('{"format":"honobox-trace","version":2}')).toThrow('version 1')
    expect(() => readSnapshot(' '.repeat(snapshotLimit + 1))).toThrow('1 MiB')
    const deep = writeSnapshot(sampleTraces[0]).replace(
      '"request": {',
      '"request": {"nested":' + '['.repeat(20000) + '0' + ']'.repeat(20000) + ',',
    )
    expect(() => readSnapshot(deep)).toThrow('nesting')
    for (const patch of [
      { events: [{ kind: 'chunk', ms: -1 }] },
      {
        events: [
          { kind: 'chunk', ms: 2 },
          { kind: 'chunk', ms: 1 },
        ],
      },
      { events: [{ kind: 'chunk', ms: 0, data: {} }] },
      { events: Array(301).fill({ kind: 'chunk', ms: 0 }) },
      { response: {} },
      { source: ['lab'] },
      { status: ['completed'] },
      { status: '<script>' },
      { durationMs: null },
    ])
      expect(() =>
        readSnapshot(
          JSON.stringify({
            format: 'honobox-trace',
            version: 1,
            trace: { ...sampleTraces[0], ...patch },
          }),
        ),
      ).toThrow()
  })
  it('assembles partial tool JSON without exposing future output or terminal state', () => {
    const trace = sampleTraces[0]
    const first = traceAtEvent(trace, 4)
    expect(first.status).toBe('running')
    expect(first.response).toBe('')
    expect(assembleOutput(first.events).tools[0].arguments).toBe('{"city":')
    expect(assembleOutput(trace.events).tools[0]).toEqual({
      name: 'get_weather',
      id: 'call_sample',
      arguments: '{"city":"Shanghai"}',
    })
    const zero = traceAtEvent(trace, 0)
    expect(zero.httpStatus).toBe(0)
    expect(zero.firstOutputMs).toBeNull()
    expect(zero.events).toEqual([])
    expect(traceAtEvent(trace, 999)).toBe(trace)
  })
  it('does not mutate a recording when scrubbing backwards after cancellation', () => {
    const trace = sampleTraces[2]
    const before = writeSnapshot(trace)
    expect(traceAtEvent(trace, 3).error).toBeUndefined()
    expect(traceAtEvent(trace, trace.events!.length).status).toBe('cancelled')
    expect(writeSnapshot(trace)).toBe(before)
  })
  it('treats unknown/malformed provider payloads as data and keeps choice zero only', () => {
    const events = [
      'null',
      '{',
      '{"choices":{}}',
      '{"choices":[{"index":1,"delta":{"content":"ignored"}},{"index":0,"delta":{"content":"visible"}}]}',
    ].map((data) => ({ kind: 'chunk', ms: 0, data }))
    expect(assembleOutput(events).text).toBe('visible')
  })
})
