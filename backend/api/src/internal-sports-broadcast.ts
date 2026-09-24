import { timingSafeEqual } from 'node:crypto'
import { APIError } from 'common/api/utils'
import { broadcastSportsLiveScore } from 'shared/websockets/helpers'
import { APIHandler } from './helpers/endpoint'

// Keep this POST off url-map-config.yaml's read-replica allowlist: only the
// API writer owns browser sockets. Mirrors the existing perp broadcast hop.
export const internalSportsBroadcast: APIHandler<
  'internal-sports-broadcast'
> = async ({ apiSecret, contractId, score }) => {
  const expected = process.env.API_SECRET
  if (!expected) throw new APIError(500, 'API_SECRET is not configured.')
  const providedBytes = Buffer.from(apiSecret)
  const expectedBytes = Buffer.from(expected)
  if (
    providedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(providedBytes, expectedBytes)
  ) {
    throw new APIError(403, 'Invalid API secret.')
  }
  broadcastSportsLiveScore(contractId, score)
  return { success: true }
}
