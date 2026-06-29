import { RPCHandler } from '@orpc/server/fetch'
import { appRouter } from './router'

/**
 * oRPC Hono 适配层
 *
 * 把 oRPC router 挂载到 Hono 的 /orpc 路径
 * 前端 client 请求 → /orpc/user.list → RPCHandler 路由到对应 procedure
 */
export const rpcHandler = new RPCHandler(appRouter)
