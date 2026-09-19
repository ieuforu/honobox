import { Hono } from 'hono'
import { renderPrometheusMetrics } from '../lib/metrics.js'

const metricsRoutes = new Hono()

metricsRoutes.get('/', (c) => {
  return c.text(renderPrometheusMetrics(), 200, {
    'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
    'Cache-Control': 'no-store',
  })
})

export default metricsRoutes
