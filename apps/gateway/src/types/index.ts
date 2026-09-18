// Context Variables — 给 c.set / c.get 用的类型
export type Variables = {
  validatedBody: Record<string, unknown>
  validatedQuery: Record<string, string>
  validatedParam: Record<string, string>
  traceId: string
  requestId: string
  apiKey: string
  apiKeyId: string
  rateLimit: number
}
