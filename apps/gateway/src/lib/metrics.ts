const LATENCY_BUCKETS_MS = [100, 250, 500, 1000, 2500, 5000, 10_000] as const

interface RequestMetric {
  count: number
  latencySumMs: number
  latencyBuckets: number[]
}

const requests = new Map<string, RequestMetric>()
const upstreamFailures = new Map<string, number>()

function requestKey(model: string, status: number, isFallback: boolean): string {
  return JSON.stringify([model, String(status), String(isFallback)])
}

function failureKey(model: string, reason: string): string {
  return JSON.stringify([model, reason])
}

export function recordGatewayRequest(input: {
  servedModel: string
  statusCode: number
  isFallback: boolean
  latencyMs: number
}): void {
  const key = requestKey(input.servedModel, input.statusCode, input.isFallback)
  const metric = requests.get(key) ?? {
    count: 0,
    latencySumMs: 0,
    latencyBuckets: LATENCY_BUCKETS_MS.map(() => 0),
  }
  metric.count += 1
  metric.latencySumMs += input.latencyMs
  LATENCY_BUCKETS_MS.forEach((bucket, index) => {
    if (input.latencyMs <= bucket) metric.latencyBuckets[index] += 1
  })
  requests.set(key, metric)
}

export function recordUpstreamFailure(model: string, reason: string): void {
  const key = failureKey(model, reason)
  upstreamFailures.set(key, (upstreamFailures.get(key) ?? 0) + 1)
}

export function renderPrometheusMetrics(): string {
  const lines = [
    '# HELP honobox_requests_total Completed gateway requests.',
    '# TYPE honobox_requests_total counter',
  ]

  for (const [key, metric] of requests) {
    const [model, status, fallback] = JSON.parse(key) as [string, string, string]
    const labels = `model="${escapeLabel(model)}",status="${status}",fallback="${fallback}"`
    lines.push(`honobox_requests_total{${labels}} ${metric.count}`)
  }

  lines.push(
    '# HELP honobox_request_duration_ms Gateway request latency in milliseconds.',
    '# TYPE honobox_request_duration_ms histogram',
  )
  for (const [key, metric] of requests) {
    const [model, status, fallback] = JSON.parse(key) as [string, string, string]
    const baseLabels = `model="${escapeLabel(model)}",status="${status}",fallback="${fallback}"`
    LATENCY_BUCKETS_MS.forEach((bucket, index) => {
      lines.push(
        `honobox_request_duration_ms_bucket{${baseLabels},le="${bucket}"} ${metric.latencyBuckets[index]}`,
      )
    })
    lines.push(`honobox_request_duration_ms_bucket{${baseLabels},le="+Inf"} ${metric.count}`)
    lines.push(`honobox_request_duration_ms_sum{${baseLabels}} ${metric.latencySumMs}`)
    lines.push(`honobox_request_duration_ms_count{${baseLabels}} ${metric.count}`)
  }

  lines.push(
    '# HELP honobox_upstream_failures_total Retryable upstream provider failures.',
    '# TYPE honobox_upstream_failures_total counter',
  )
  for (const [key, count] of upstreamFailures) {
    const [model, reason] = JSON.parse(key) as [string, string]
    lines.push(
      `honobox_upstream_failures_total{model="${escapeLabel(model)}",reason="${escapeLabel(reason)}"} ${count}`,
    )
  }

  return `${lines.join('\n')}\n`
}

export function resetMetrics(): void {
  requests.clear()
  upstreamFailures.clear()
}

function escapeLabel(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n')
}
