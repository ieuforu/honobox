import { pgTable, uuid, varchar, boolean, integer, timestamp } from 'drizzle-orm/pg-core'

export const models = pgTable('models', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  provider: varchar('provider', { length: 50 }).notNull(), // openai, anthropic, deepseek
  modelId: varchar('model_id', { length: 100 }).notNull().unique(), // e.g. gpt-4o
  baseUrl: varchar('base_url', { length: 256 }).notNull(),
  apiKey: varchar('api_key', { length: 256 }).notNull(),
  maxTokens: integer('max_tokens'),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export type ModelSelect = typeof models.$inferSelect
export type ModelInsert = typeof models.$inferInsert
