import { pgTable, uuid, varchar, integer, boolean, text, timestamp } from 'drizzle-orm/pg-core'

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  key: varchar('key', { length: 256 }).notNull().unique(),
  rateLimit: integer('rate_limit').notNull().default(100),
  quota: integer('quota'),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at'),
})

export type ApiKeySelect = typeof apiKeys.$inferSelect
export type ApiKeyInsert = typeof apiKeys.$inferInsert
