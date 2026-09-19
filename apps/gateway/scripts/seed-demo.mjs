import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import pg from 'pg'

const { Pool } = pg

const encryptionKey = process.env.MODEL_ENCRYPTION_KEY
if (!encryptionKey) throw new Error('MODEL_ENCRYPTION_KEY is required')

function encryptSecret(value) {
  const key = createHash('sha256').update(encryptionKey).digest()
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv, authTag, encrypted].map((part) => part.toString('base64url')).join('.')
}

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'ai_gateway',
})

try {
  const encryptedDemoKey = encryptSecret('demo-not-routable')
  await pool.query(
    `INSERT INTO models
       (name, provider, model_id, base_url, api_key_encrypted, max_tokens, enabled)
     VALUES
       ('GPT-4o Mini — Backup', 'openai', 'gpt-4o-mini-backup', 'https://api.openai.com/v1', $1, 16384, true)
     ON CONFLICT (model_id) DO UPDATE SET
       name = EXCLUDED.name,
       base_url = EXCLUDED.base_url,
       max_tokens = EXCLUDED.max_tokens,
       enabled = EXCLUDED.enabled`,
    [encryptedDemoKey],
  )
  await pool.query(
    `INSERT INTO models
       (name, provider, model_id, base_url, api_key_encrypted, max_tokens, fallback_model_id, enabled)
     VALUES
       ('GPT-4o Mini — Primary', 'openai', 'gpt-4o-mini', 'https://api.openai.com/v1', $1, 16384, 'gpt-4o-mini-backup', true)
     ON CONFLICT (model_id) DO UPDATE SET
       name = EXCLUDED.name,
       base_url = EXCLUDED.base_url,
       max_tokens = EXCLUDED.max_tokens,
       fallback_model_id = EXCLUDED.fallback_model_id,
       enabled = EXCLUDED.enabled`,
    [encryptedDemoKey],
  )

  const demoKeyHash = createHash('sha256').update('demo-disabled-key').digest('hex')
  await pool.query(
    `INSERT INTO api_keys (name, key_hash, key_prefix, rate_limit, quota, enabled)
     VALUES ('Portfolio demo (disabled)', $1, 'sk-demo', 60, 10000, false)
     ON CONFLICT (key_hash) DO UPDATE SET
       name = EXCLUDED.name,
       rate_limit = EXCLUDED.rate_limit,
       quota = EXCLUDED.quota,
       enabled = false`,
    [demoKeyHash],
  )

  await pool.query(`DELETE FROM llm_requests WHERE trace_id LIKE 'demo-%'`)
  await pool.query(`
    INSERT INTO llm_requests (
      trace_id,
      request_id,
      model,
      served_model,
      latency_ms,
      status_code,
      is_fallback,
      prompt_tokens,
      completion_tokens,
      error,
      created_at
    )
    SELECT
      'demo-' || i,
      'req-demo-' || i,
      CASE WHEN i % 5 = 0 THEN 'deepseek-chat' ELSE 'gpt-4o-mini' END,
      CASE WHEN i % 7 = 0 THEN 'gpt-4o-mini-backup'
           WHEN i % 5 = 0 THEN 'deepseek-chat'
           ELSE 'gpt-4o-mini' END,
      180 + ((i * 47) % 1450),
      CASE WHEN i % 29 = 0 THEN 503 ELSE 200 END,
      i % 7 = 0,
      120 + ((i * 13) % 780),
      40 + ((i * 17) % 360),
      CASE WHEN i % 29 = 0 THEN 'upstream returned 503' ELSE NULL END,
      NOW() - (i * INTERVAL '6 minutes')
    FROM generate_series(0, 239) AS i
  `)

  console.log('Seeded 240 synthetic requests, two models, and one disabled demo key.')
} finally {
  await pool.end()
}
