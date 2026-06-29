import { userList, userCreate, userUpdate, userDelete } from './procedures/user'

/**
 * oRPC Router — 所有 procedure 组合成一棵路由树
 *
 * oRPC v1 的 router 就是一个嵌套的 procedure 对象
 * 前端通过 client.user.list({ search: 'xxx' }) 调用
 * 类型完全推导，不需要手写 API 客户端
 */
export const appRouter = {
  user: {
    list: userList,
    create: userCreate,
    update: userUpdate,
    delete: userDelete,
  },
}

export type AppRouter = typeof appRouter
