import { timingSafeEqual } from 'node:crypto'

import { APIError } from 'common/api/utils'
import { broadcastPerpQuote } from 'shared/websockets/helpers'
import { APIHandler } from './helpers/endpoint'

/** Length-safe constant-time compare; `timingSafeEqual` throws on a size mismatch. */
const secretMatches = (provided: string, expected: string) => {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Rebroadcast an applied oracle tick to subscribed perp pages.
 *
 * Called only by the scheduler (see perps/publish-perp-quote.ts for why the
 * hop exists). Authenticated with API_SECRET rather than a user token — the
 * caller is a service, not a person — following the same shared-secret pattern
 * as revalidateStaticProps.
 *
 * This must run in the process that owns the websocket server. The load
 * balancer sends it there because the path is absent from the read-replica
 * allowlist in url-map-config.yaml; a replica would accept and drop it.
 */
export const internalPerpBroadcast: APIHandler<
  'internal-perp-broadcast'
> = async (body) => {
  const { apiSecret, quote } = body

  const expected = process.env.API_SECRET
  if (!expected) {
    // Fail loudly rather than accepting unauthenticated broadcasts.
    throw new APIError(500, 'API_SECRET is not configured on this server.')
  }
  if (!secretMatches(apiSecret, expected)) {
    throw new APIError(403, 'Invalid API secret.')
  }

  broadcastPerpQuote(quote)
  return { success: true }
}
