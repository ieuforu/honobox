import { pgTable, uuid, varchar, integer, timestamp, unique } from 'drizzle-orm/pg-core'

export const rateLimits = pgTable(
  'rate_limits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: varchar('key', { length: 128 }).notNull(),
    windowStart: timestamp('window_start').notNull(),
    count: integer('count').notNull().default(1),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('rate_limits_key_window_uniq').on(t.key, t.windowStart)],
)

export type RateLimitSelect = typeof rateLimits.$inferSelect
export type RateLimitInsert = typeof rateLimits.$inferInsert
