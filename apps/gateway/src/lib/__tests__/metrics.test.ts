import { beforeEach, describe, expect, it } from 'vitest'
import {
  recordGatewayRequest,
  recordUpstreamFailure,
  renderPrometheusMetrics,
  resetMetrics,
} from '../metrics.js'

describe('Prometheus metrics', () => {
  beforeEach(resetMetrics)

  it('renders request counters and cumulative latency buckets', () => {
    recordGatewayRequest({
      servedModel: 'backup-model',
      statusCode: 200,
      isFallback: true,
      latencyMs: 240,
    })

    const output = renderPrometheusMetrics()
    expect(output).toContain(
      'honobox_requests_total{model="backup-model",status="200",fallback="true"} 1',
    )
    expect(output).toContain('le="100"} 0')
    expect(output).toContain('le="250"} 1')
    expect(output).toContain('honobox_request_duration_ms_sum')
  })

  it('tracks upstream failures by model and reason', () => {
    recordUpstreamFailure('primary', 'retryable')
    recordUpstreamFailure('primary', 'retryable')

    expect(renderPrometheusMetrics()).toContain(
      'honobox_upstream_failures_total{model="primary",reason="retryable"} 2',
    )
  })
})
