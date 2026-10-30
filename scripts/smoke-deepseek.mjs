import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

// Opt-in only. This script is never run by CI or pnpm check.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const keyFile = join(root, 'apps/inspector/.env.local')
let key
let credentialSource = 'local_file'
try {
  key = parseEnv(await readFile(keyFile, 'utf8')).DEEPSEEK_API_KEY
} catch {
  /* Report absence without printing file contents. */
}
if (!key) {
  key = process.env.DEEPSEEK_API_KEY
  credentialSource = 'environment'
}
if (!key)
  throw new Error(
    'Set DEEPSEEK_API_KEY privately or fill apps/inspector/.env.local before this opt-in test.',
  )

const socket = createServer()
await new Promise((resolve, reject) => {
  socket.once('error', reject)
  socket.listen(0, '127.0.0.1', resolve)
})
const port = socket.address().port
await new Promise((resolve) => socket.close(resolve))
const base = `http://127.0.0.1:${port}`
const temporary = await mkdtemp(join(tmpdir(), 'honobox-live-'))
const admin = randomUUID()
const gateway = randomUUID()
const child = spawn(join(root, 'bin/honobox'), [], {
  cwd: root,
  env: {
    ...process.env,
    DEEPSEEK_API_KEY: key,
    HONOBOX_UPSTREAM_BASE_URL: 'https://api.deepseek.com',
    HONOBOX_ADDR: `127.0.0.1:${port}`,
    HONOBOX_DB_PATH: join(temporary, 'traces.db'),
    HONOBOX_ADMIN_TOKEN: admin,
    HONOBOX_GATEWAY_TOKEN: gateway,
  },
  stdio: 'ignore',
})
let spawnError
child.on('error', (error) => {
  spawnError = error
})
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}
const report = {
  model: process.env.HONOBOX_MODEL || 'deepseek-flash',
  credentialSource,
  scenarios: [],
}

async function completion(name, body) {
  const response = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${gateway}` },
    body: JSON.stringify({
      model: report.model,
      thinking: { type: 'disabled' },
      max_tokens: 128,
      ...body,
    }),
    signal: AbortSignal.timeout(95_000),
  })
  const text = await response.text()
  assert(
    response.ok,
    `${name}: upstream HTTP ${response.status}. Provider error bodies are withheld from test output.`,
  )
  const id = response.headers.get('X-Honobox-Trace-Id')
  assert(id, `${name}: missing trace ID`)
  let trace
  for (let attempt = 0; attempt < 20; attempt++) {
    const snapshot = await fetch(`${base}/api/traces/${id}`, {
      headers: { Authorization: `Bearer ${admin}` },
    })
    assert(snapshot.ok, `${name}: trace lookup failed`)
    trace = await snapshot.json()
    if (trace.status !== 'running') break
    await pause(50)
  }
  assert(trace.status === 'completed', `${name}: final trace status ${trace.status}`)
  assert(
    !JSON.stringify(trace).includes(key),
    `${name}: credential unexpectedly appeared in captured data`,
  )
  report.scenarios.push({
    name,
    httpStatus: response.status,
    traceStatus: trace.status,
    eventCount: trace.events.length,
    durationMs: trace.durationMs,
    firstOutputMs: trace.firstOutputMs,
  })
  if (!body.stream) return JSON.parse(text)
  assert(text.includes('data: [DONE]'), `${name}: stream has no terminal marker`)
  return text
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:') && !line.includes('[DONE]'))
    .map((line) => JSON.parse(line.slice(5).trim()))
}

try {
  let ready = false
  for (let attempt = 0; attempt < 80; attempt++) {
    if (spawnError)
      throw new Error('Could not start the built inspector binary. Run pnpm build:inspector first.')
    if (child.exitCode !== null) throw new Error('Inspector exited before the live test started.')
    try {
      const response = await fetch(`${base}/api/config`, {
        headers: { Authorization: `Bearer ${admin}` },
      })
      if (response.ok && (await response.json()).liveConfigured) {
        ready = true
        break
      }
    } catch {
      /* Wait for this private test process. */
    }
    await pause(100)
  }
  assert(ready, 'The private test inspector did not become ready.')
  const streamed = await completion('streamed_text', {
    messages: [{ role: 'user', content: 'Reply in one short sentence: the connection works.' }],
    stream: true,
    max_tokens: 48,
  })
  assert(
    streamed.some((chunk) => chunk.choices?.some((choice) => choice.delta?.content)),
    'No text deltas received',
  )

  const messages = [
    {
      role: 'user',
      content:
        'Use get_weather to check the test fixture for Shanghai. Then report only the temperature in Celsius.',
    },
  ]
  const tools = [
    {
      type: 'function',
      function: {
        name: 'get_weather',
        description: 'A test-only weather fixture. This does not return real weather.',
        parameters: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
        },
      },
    },
  ]
  const chunks = await completion('streamed_tool_call', {
    messages,
    tools,
    tool_choice: { type: 'function', function: { name: 'get_weather' } },
    stream: true,
  })
  const calls = new Map()
  for (const chunk of chunks) {
    for (const choice of chunk.choices || []) {
      for (const fragment of choice.delta?.tool_calls || []) {
        const call = calls.get(fragment.index) || {
          id: '',
          type: 'function',
          function: { name: '', arguments: '' },
        }
        if (fragment.id) call.id = fragment.id
        call.function.name += fragment.function?.name || ''
        call.function.arguments += fragment.function?.arguments || ''
        calls.set(fragment.index, call)
      }
    }
  }
  const call = calls.get(0)
  assert(
    calls.size === 1 && call?.id && call.function.name === 'get_weather',
    'Tool-call identity was incomplete',
  )
  assert(
    typeof JSON.parse(call.function.arguments).city === 'string',
    'Tool-call arguments were not valid JSON',
  )
  const final = await completion('tool_result_round_trip', {
    messages: [
      ...messages,
      { role: 'assistant', content: null, tool_calls: [call] },
      {
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify({ temperature_c: 24, source: 'local_test_fixture' }),
      },
    ],
    tools,
    tool_choice: 'none',
    stream: false,
    max_tokens: 48,
  })
  assert(
    final.choices?.[0]?.message?.content?.includes('24'),
    'The model did not incorporate the supplied tool result',
  )
  report.success = true
  console.log(JSON.stringify(report, null, 2))
} finally {
  child.kill('SIGTERM')
  await Promise.race([new Promise((resolve) => child.once('exit', resolve)), pause(6000)])
  if (child.exitCode === null) child.kill('SIGKILL')
  await rm(temporary, { recursive: true, force: true })
}
