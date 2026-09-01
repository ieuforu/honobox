import { Hono } from 'hono'
import { z } from 'zod'
import { validator } from '../middlewares/validator'
import { authMiddleware } from '../middlewares/auth'
import { userService } from '../services/users'
import type { Variables } from '../types'

const users = new Hono<{ Variables: Variables }>()

// Zod schema — 这里推导类型，下游 handler 直接拿到正确的输入
const createUserSchema = z.object({
  name: z.string().min(2, '名字至少2个字符').max(100),
  email: z.string().email('邮箱格式不正确'),
  role: z.enum(['admin', 'user']).optional().default('user'),
})

const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  role: z.enum(['admin', 'user']).optional(),
})

type CreateUser = z.infer<typeof createUserSchema>
type UpdateUser = z.infer<typeof updateUserSchema>

// GET /users
users.get('/', async (c) => {
  const search = c.req.query('search')
  const result = await userService.findAll(search)
  return c.json({ data: result, total: result.length })
})

// GET /users/:id
users.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: '无效的 ID' }, 400)
  const user = await userService.findById(id)
  if (!user) return c.json({ error: '用户不存在' }, 404)
  return c.json({ data: user })
})

// POST /users
users.post('/', validator(createUserSchema), async (c) => {
  const body = c.get('validatedBody') as CreateUser
  const existing = await userService.findByEmail(body.email)
  if (existing) return c.json({ error: '邮箱已存在' }, 409)
  const user = await userService.create(body)
  return c.json({ data: user }, 201)
})

// PUT /users/:id
users.put('/:id', authMiddleware, validator(updateUserSchema), async (c) => {
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: '无效的 ID' }, 400)
  const body = c.get('validatedBody') as UpdateUser
  const user = await userService.update(id, body)
  if (!user) return c.json({ error: '用户不存在' }, 404)
  return c.json({ data: user })
})

// DELETE /users/:id
users.delete('/:id', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'))
  if (isNaN(id)) return c.json({ error: '无效的 ID' }, 400)
  const user = await userService.delete(id)
  if (!user) return c.json({ error: '用户不存在' }, 404)
  return c.json({ message: `用户 ${id} 已删除` })
})

export default users
