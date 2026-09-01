import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { RouterClient } from '@orpc/server'
import type { appRouter } from './router'

/**
 * oRPC Client — 前端用
 *
 * 用法：
 *   import { client } from '../orpc/client'
 *   const { data, total } = await client.user.list({ search: 'alice' })
 *
 * 类型从 RouterClient 推导，不需要手写任何类型
 */
const link = new RPCLink({
  url: 'http://localhost:3000/orpc',
})

export const client = createORPCClient<RouterClient<typeof appRouter>>(link)
