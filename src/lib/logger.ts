import pino from 'pino'
import { config } from '../config'

const baseLogger = pino({
  level: config.logLevel,
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: config.isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l o',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
})

/**
 * 创建带 traceId 的子 logger
 * 每条日志自动带上 traceId 字段
 */
export function createTraceLogger(traceId: string) {
  return baseLogger.child({ traceId })
}

export default baseLogger
