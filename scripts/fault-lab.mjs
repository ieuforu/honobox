import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'

const gatewayUrl = 'http://127.0.0.1:4300'
const providerPort = 4301
const adminToken = 'honobox-fault-lab-admin'
const runId = Date.now().toString(36)
const primaryModel = `lab-primary-${runId}`
const backupModel = `lab-backup-${runId}`
let primaryMode = 'success'

const mockProvider = createServer(async (request, response) => {
  if (request.method !== 'POST' || !request.url?.endsWith('/chat/completions')) {
    response.writeHead(404).end()
    return
  }

  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  const isPrimary = request.url.startsWith('/primary/')

  if (isPrimary && primaryMode === 'fail') {
    response.writeHead(503, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ error: { message: 'fault lab injected 503' } }))
    return
  }

  const servedModel = isPrimary ? primaryModel : backupModel
  if (body.stream) {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    })
    response.write(
      `data: ${JSON.stringify({
        id: `chunk-${runId}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: servedModel,
        choices: [{ index: 0, delta: { content: 'fault-lab-ok' }, finish_reason: null }],
      })}\n\n`,
    )
    response.end('data: [DONE]\n\n')
    return
  }

  response.writeHead(200, { 'Content-Type': 'application/json' })
  response.end(
    JSON.stringify({
      id: `completion-${runId}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: servedModel,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'fault-lab-ok' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
    }),
  )
})

await new Promise((resolve, reject) => {
  mockProvider.once('error', reject)
  mockProvider.listen(providerPort, '127.0.0.1', resolve)
})

const migration = spawnSync('pnpm', ['--filter', '@ai-gateway/gateway', 'db:migrate'], {
  cwd: process.cwd(),
  encoding: 'utf8',
})
if (migration.status !== 0) {
  mockProvider.close()
  throw new Error(`Migration failed:\n${migration.stderr || migration.stdout}`)
}

const gateway = spawn('node', ['apps/gateway/dist/index.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: '4300',
    NODE_ENV: 'test',
    ADMIN_TOKEN: adminToken,
    MODEL_ENCRYPTION_KEY: 'honobox-fault-lab-encryption-key',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let gatewayLogs = ''
gateway.stdout.on('data', (chunk) => (gatewayLogs += chunk.toString()))
gateway.stderr.on('data', (chunk) => (gatewayLogs += chunk.toString()))

let apiKeyId
let apiKey
const modelIds = []

try {
  await waitForHealth()

  const backup = await adminRequest('/api/models', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Fault Lab Backup',
      provider: 'openai',
      modelId: backupModel,
      baseUrl: `http://127.0.0.1:${providerPort}/backup/v1`,
      apiKey: 'mock-backup-key',
      maxTokens: null,
      fallbackModelId: null,
    }),
  })
  modelIds.push(backup.id)

  const primary = await adminRequest('/api/models', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Fault Lab Primary',
      provider: 'openai',
      modelId: primaryModel,
      baseUrl: `http://127.0.0.1:${providerPort}/primary/v1`,
      apiKey: 'mock-primary-key',
      maxTokens: null,
      fallbackModelId: backupModel,
    }),
  })
  modelIds.push(primary.id)

  const key = await adminRequest('/api/api-keys', {
    method: 'POST',
    body: JSON.stringify({ name: `fault-lab-${runId}`, rateLimit: 10_000, quota: null }),
  })
  apiKeyId = key.id
  apiKey = key.key

  await runRequests(5, 1)
  const baseline = await runRequests(100, 10)

  primaryMode = 'fail'
  const streaming = await runStreamingRequest()

  primaryMode = 'success'
  await runRequests(1, 1)
  primaryMode = 'fail'
  const failover = await runRequests(100, 10)

  const metrics = await adminRequest('/api/metrics', { headers: { Accept: 'text/plain' } }, true)
  const result = {
    generatedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      concurrency: 10,
      requestsPerScenario: 100,
    },
    baseline,
    failover,
    streaming,
    assertions: {
      baselineAllPrimary: baseline.servedByBackup === 0,
      failoverAllSuccessful: failover.errors === 0,
      failoverUsedBackup: failover.servedByBackup === 100,
      streamSwitchedBeforeFirstToken: streaming.includes('fault-lab-ok'),
      prometheusRecordedFallback: metrics.includes('fallback="true"'),
      prometheusRecordedFailures: metrics.includes('honobox_upstream_failures_total'),
    },
  }

  if (Object.values(result.assertions).some((passed) => !passed)) {
    throw new Error(`Fault-lab assertions failed: ${JSON.stringify(result, null, 2)}`)
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} finally {
  if (apiKeyId) await adminRequest(`/api/api-keys/${apiKeyId}`, { method: 'DELETE' }).catch(() => {})
  for (const modelId of modelIds.reverse()) {
    await adminRequest(`/api/models/${modelId}`, { method: 'DELETE' }).catch(() => {})
  }
  gateway.kill('SIGTERM')
  mockProvider.close()
}

async function adminRequest(path, init = {}, raw = false) {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${adminToken}`)
  if (init.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${gatewayUrl}${path}`, { ...init, headers })
  const body = await response.text()
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} failed: ${response.status} ${body}`)
  return raw ? body : JSON.parse(body)
}

async function runRequests(total, concurrency) {
  const latencies = []
  let errors = 0
  let servedByBackup = 0
  let cursor = 0

  async function worker() {
    while (cursor < total) {
      cursor += 1
      const started = performance.now()
      try {
        const response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: primaryModel,
            messages: [{ role: 'user', content: 'fault lab' }],
          }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(JSON.stringify(data))
        if (data.model === backupModel) servedByBackup += 1
      } catch {
        errors += 1
      } finally {
        latencies.push(performance.now() - started)
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  latencies.sort((a, b) => a - b)
  return {
    requests: total,
    concurrency,
    errors,
    servedByBackup,
    p50Ms: round(percentile(latencies, 0.5)),
    p95Ms: round(percentile(latencies, 0.95)),
    maxMs: round(latencies.at(-1) ?? 0),
  }
}

async function runStreamingRequest() {
  const response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: primaryModel,
      stream: true,
      messages: [{ role: 'user', content: 'fault lab stream' }],
    }),
  })
  if (!response.ok) throw new Error(`Streaming request failed: ${response.status}`)
  return response.text()
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (gateway.exitCode !== null) throw new Error(`Gateway exited early:\n${gatewayLogs}`)
    try {
      const response = await fetch(`${gatewayUrl}/health`)
      if (response.ok) return
    } catch {
      // Gateway has not started yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Gateway did not become healthy:\n${gatewayLogs}`)
}

function percentile(values, quantile) {
  if (values.length === 0) return 0
  return values[Math.min(values.length - 1, Math.ceil(values.length * quantile) - 1)]
}

function round(value) {
  return Math.round(value * 100) / 100
}
