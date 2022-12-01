import { z } from 'zod'
import { APIError } from 'common/api'

export const log = (...args: unknown[]) => {
  console.log(`[${new Date().toISOString()}]`, ...args)
}

export const validate = <T extends z.ZodTypeAny>(schema: T, val: unknown) => {
  const result = schema.safeParse(val)
  if (!result.success) {
    const issues = result.error.issues.map((i) => {
      // TODO: export this type for the front-end to parse
      return {
        field: i.path.join('.') || null,
        error: i.message,
      }
    })
    throw new APIError(400, 'Error validating request.', issues)
  } else {
    return result.data as z.infer<T>
  }
}
