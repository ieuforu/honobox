import pino from 'pino'
import { config } from '../config'

const logger = pino({
  level: config.logLevel,
  // 强制用 Asia/Shanghai 时区
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: config.isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l o', // o = UTC offset
          ignore: 'pid,hostname',
        },
      }
    : undefined,
})

export default logger
