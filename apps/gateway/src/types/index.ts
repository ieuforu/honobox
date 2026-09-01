import type { UserResponse } from '../db/schema'

// Context Variables — 给 c.set / c.get 用的类型
export type Variables = {
  userId: string
  currentUser: UserResponse
  validatedBody: Record<string, unknown>
  validatedQuery: Record<string, string>
  validatedParam: Record<string, string>
  traceId: string
}
