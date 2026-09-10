import { APIError } from 'common/api/utils'

// Used only by user-initiated trades. The same 4xx from a scheduled oracle,
// funding or resolution operation is unexpected and must remain an error.
export const isExpectedPerpTradeError = (error: unknown) =>
  error instanceof APIError && error.code >= 400 && error.code < 500
