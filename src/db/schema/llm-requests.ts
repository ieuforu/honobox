import { pgTable, uuid, varchar, integer, boolean, text, timestamp } from 'drizzle-orm/pg-core'

export const llmRequests = pgTable('llm_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  traceId: varchar('trace_id', { length: 64 }).notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  latencyMs: integer('latency_ms').notNull(),
  statusCode: integer('status_code').notNull(),
  isFallback: boolean('is_fallback').notNull().default(false),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  error: text('error'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export type LLMRequestSelect = typeof llmRequests.$inferSelect
export type LLMRequestInsert = typeof llmRequests.$inferInsert
