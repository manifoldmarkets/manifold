/** Quote inputs must come from the origin, including on post-mutation reads.
 * Use the same policy for browser requests and API response headers. */
export const isUncachedQuoteRead = (
  path: string,
  params: Record<string, unknown>
) =>
  (path === 'bets' && params.kinds === 'open-limit') ||
  path === 'markets-by-ids' ||
  path === 'users/by-id/balance'
