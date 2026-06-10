import { db } from '../db'
import { users } from '../db/schema'
import type { UserSelect, UserResponse } from '../db/schema'
import { eq, ilike, desc } from 'drizzle-orm'
import { toShanghai } from '../lib/format'
import logger from '../lib/logger'

function formatUser(row: UserSelect): UserResponse {
  return {
    ...row,
    createdAt: toShanghai(row.createdAt),
    updatedAt: toShanghai(row.updatedAt),
  }
}

// Service 层 — 纯业务逻辑，接收明确的参数类型
export const userService = {
  async findAll(search?: string) {
    const rows = search
      ? await db.select().from(users).where(ilike(users.name, `%${search}%`)).orderBy(desc(users.createdAt))
      : await db.select().from(users).orderBy(desc(users.createdAt))
    return rows.map(formatUser)
  },

  async findById(id: number) {
    const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1)
    return row ? formatUser(row) : null
  },

  async findByEmail(email: string) {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
    return user ?? null
  },

  async create(input: { name: string; email: string; role?: 'admin' | 'user' }) {
    logger.info({ input }, '创建用户')
    const [row] = await db.insert(users).values(input).returning()
    return formatUser(row)
  },

  async update(id: number, input: { name?: string; email?: string; role?: 'admin' | 'user' }) {
    const [row] = await db.update(users).set({ ...input, updatedAt: new Date() }).where(eq(users.id, id)).returning()
    return row ? formatUser(row) : null
  },

  async delete(id: number) {
    const [user] = await db.delete(users).where(eq(users.id, id)).returning()
    return user ? formatUser(user) : null
  },
}
