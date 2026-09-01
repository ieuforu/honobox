import { os, ORPCError } from '@orpc/server'
import { z } from 'zod'
import { userService } from '../../services/users'

// ---- Zod schemas ----

const listInput = z.object({
  search: z.string().optional(),
})

const createInput = z.object({
  name: z.string().min(2, '名字至少2个字符').max(100),
  email: z.string().email('邮箱格式不正确'),
  role: z.enum(['admin', 'user']).optional().default('user'),
})

const updateInput = z.object({
  id: z.number().int().positive(),
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  role: z.enum(['admin', 'user']).optional(),
})

const deleteInput = z.object({
  id: z.number().int().positive(),
})

// ---- Procedures ----

export const userList = os
  .input(listInput)
  .handler(async ({ input }) => {
    const result = await userService.findAll(input.search)
    return { data: result, total: result.length }
  })

export const userCreate = os
  .input(createInput)
  .handler(async ({ input }) => {
    const existing = await userService.findByEmail(input.email)
    if (existing) {
      throw new ORPCError('CONFLICT', { message: '邮箱已存在' })
    }
    const user = await userService.create(input)
    return { data: user }
  })

export const userUpdate = os
  .input(updateInput)
  .handler(async ({ input }) => {
    const { id, ...data } = input
    const user = await userService.update(id, data)
    if (!user) {
      throw new ORPCError('NOT_FOUND', { message: '用户不存在' })
    }
    return { data: user }
  })

export const userDelete = os
  .input(deleteInput)
  .handler(async ({ input }) => {
    const user = await userService.delete(input.id)
    if (!user) {
      throw new ORPCError('NOT_FOUND', { message: '用户不存在' })
    }
    return { message: `用户 ${input.id} 已删除` }
  })
