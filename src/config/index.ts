import 'dotenv/config'

export const config = {
  port: parseInt(process.env.PORT || '3000'),
  isDev: process.env.NODE_ENV !== 'production',
  logLevel: process.env.LOG_LEVEL || 'info',
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'isla',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'hono_test',
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-do-not-use-in-prod',
  },
} as const
