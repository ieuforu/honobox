import 'dotenv/config'

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  isDev: process.env.NODE_ENV !== 'production',
  logLevel: process.env.LOG_LEVEL || 'info',
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'ai_gateway',
  },
  auth: {
    adminToken: process.env.ADMIN_TOKEN || '',
    modelEncryptionKey: process.env.MODEL_ENCRYPTION_KEY || 'dev-secret-do-not-use-in-prod',
    demoMode: process.env.DEMO_MODE === 'true',
  },
  dify: {
    baseUrl: process.env.DIFY_BASE_URL || 'http://localhost/v1',
    apiKey: process.env.DIFY_API_KEY || '',
  },
} as const

if (!config.isDev) {
  const missingSecrets = [
    !process.env.ADMIN_TOKEN && 'ADMIN_TOKEN',
    !process.env.MODEL_ENCRYPTION_KEY && 'MODEL_ENCRYPTION_KEY',
  ].filter((name): name is string => Boolean(name))

  if (missingSecrets.length > 0) {
    throw new Error(`Missing required production secrets: ${missingSecrets.join(', ')}`)
  }
}
