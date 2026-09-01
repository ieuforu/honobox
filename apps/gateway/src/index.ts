import { serve } from '@hono/node-server'
import { config } from './config'
import app from './app'

const mode = config.isDev ? 'development' : 'production'
const lines = [
  '🚀  Hono Server Started',
  '',
  `Local:   http://localhost:${config.port}`,
  `Mode:    ${mode}`,
  `SSE:     http://localhost:${config.port}/api/events`,
]

const width = 42
const pad = (s: string) => `║  ${s}${' '.repeat(Math.max(0, width - 4 - s.length))}║`

const banner = [
  '╔' + '═'.repeat(width) + '╗',
  ...lines.map((l) => pad(l)),
  '╚' + '═'.repeat(width) + '╝',
].join('\n')

serve({ fetch: app.fetch, port: config.port }, () => console.log('\n' + banner + '\n'))
