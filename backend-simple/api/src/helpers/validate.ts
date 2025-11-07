import { z } from 'zod'
import { APIError } from './auth'

export function validate<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): z.infer<T> {
  const result = schema.safeParse(data)

  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      field: issue.path.join('.') || null,
      error: issue.message,
    }))

    throw new APIError(
      400,
      `Validation failed: ${JSON.stringify(issues, null, 2)}`
    )
  }

  return result.data
}

// Common validation schemas
export const schemas = {
  // User schemas
  createUser: z.object({
    username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
    name: z.string().min(1).max(50),
    avatarUrl: z.string().url().optional(),
  }),

  updateUser: z.object({
    name: z.string().min(1).max(50).optional(),
    username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/).optional(),
    avatarUrl: z.string().url().optional(),
    bio: z.string().max(500).optional(),
  }),

  // Market schemas
  createMarket: z.object({
    question: z.string().min(5).max(120),
    description: z.string().max(16000).optional(),
    outcomeType: z.enum(['BINARY', 'MULTIPLE_CHOICE']),
    closeTime: z.number().optional(),
    visibility: z.enum(['public', 'unlisted']).optional().default('public'),
    answers: z.array(z.string()).optional(), // For MULTIPLE_CHOICE
  }),

  resolveMarket: z.object({
    resolution: z.enum(['YES', 'NO', 'MKT', 'CANCEL']),
    resolutionProbability: z.number().min(0).max(1).optional(),
  }),

  // Betting schemas
  placeBet: z.object({
    contractId: z.string(),
    amount: z.number().min(1), // MIN_BET = 1
    outcome: z.string(), // 'YES' or 'NO' for binary
    answerId: z.string().optional(), // For multi-choice
  }),

  sellShares: z.object({
    outcome: z.string(),
    shares: z.number().positive().optional(), // Sell all if not specified
  }),

  // Comment schema
  createComment: z.object({
    contractId: z.string(),
    content: z.string().min(1).max(10000),
  }),

  // Query schemas
  paginationQuery: z.object({
    limit: z.coerce.number().min(1).max(1000).default(100),
    offset: z.coerce.number().min(0).default(0),
  }),

  searchQuery: z.object({
    term: z.string().optional(),
    limit: z.coerce.number().min(1).max(100).default(20),
    sort: z.enum(['created-time', 'score', 'volume']).optional().default('score'),
    filter: z.enum(['all', 'open', 'closed', 'resolved']).optional().default('all'),
  }),
}
