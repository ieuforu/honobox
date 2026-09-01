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
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-do-not-use-in-prod',
  },
  dify: {
    baseUrl: process.env.DIFY_BASE_URL || 'http://localhost/v1',
    apiKey: process.env.DIFY_API_KEY || '',
  },
} as const
