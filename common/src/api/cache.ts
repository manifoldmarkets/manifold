/** Quote panels ask for `fresh` reads of their inputs, which bypass the CDN and
 * browser caches, including on post-mutation reads. Other callers of these
 * endpoints (cards, tables, the perps poll, API clients) keep the endpoints'
 * normal caching. Used for both the fetch option and the response header, so
 * `params` may be parsed props or a raw query string. */
export const isUncachedQuoteRead = (
  path: string,
  params: Record<string, unknown>
) =>
  (params.fresh === true || params.fresh === 'true') &&
  ((path === 'bets' && params.kinds === 'open-limit') ||
    path === 'markets-by-ids' ||
    path === 'users/by-id/balance')

/** How far a response cached under `strategy` can lag the origin: max-age plus
 * stale-while-revalidate, which the CDN and browsers honor even for requests
 * that send no-cache. Ages are counted in whole seconds, so add one more. */
export const maxCachedAgeMs = (strategy: string | undefined) => {
  const seconds = (directive: string) =>
    Number(strategy?.match(new RegExp(`\\b${directive}=(\\d+)`))?.[1] ?? 0)
  const lag = seconds('max-age') + seconds('stale-while-revalidate')
  return lag && (lag + 1) * 1000
}
