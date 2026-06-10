import { pgTable, serial, varchar, pgEnum, timestamp } from 'drizzle-orm/pg-core'

export const roleEnum = pgEnum('user_role', ['admin', 'user'])

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  role: roleEnum('role').notNull().default('user'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export type UserSelect = typeof users.$inferSelect
export type UserInsert = typeof users.$inferInsert

// 从 DB 结果去掉 createdAt/updatedAt（转字符串后重新加）
export type UserResponse = Omit<UserSelect, 'createdAt' | 'updatedAt'> & {
  createdAt: string
  updatedAt: string
}
