import { createMiddleware } from 'hono/factory'
import type { ZodSchema } from 'zod'
import type { Variables } from '../types'

type ValidationTarget = 'json' | 'query' | 'param'

interface ZodIssue {
  path: (string | number)[]
  message: string
}

interface ZodLikeError {
  name?: string
  issues?: ZodIssue[]
}

export const validator = <T extends ZodSchema>(schema: T, target: ValidationTarget = 'json') =>
  createMiddleware<{ Variables: Variables }>(async (c, next) => {
    try {
      let data: unknown

      switch (target) {
        case 'json':
          data = await c.req.json()
          break
        case 'query':
          data = Object.fromEntries(new URL(c.req.url).searchParams)
          break
        case 'param':
          data = c.req.param()
          break
      }

      const parsed = schema.parse(data)

      if (target === 'json') c.set('validatedBody', parsed as Variables['validatedBody'])
      else if (target === 'query') c.set('validatedQuery', parsed as Record<string, string>)
      else c.set('validatedParam', parsed as Record<string, string>)

      await next()
    } catch (err: unknown) {
      const zodErr = err as ZodLikeError
      if (zodErr?.issues) {
        return c.json(
          {
            error: '验证失败',
            details: zodErr.issues.map((e) => ({
              field: e.path.join('.'),
              message: e.message,
            })),
          },
          400,
        )
      }
      throw err
    }
  })
