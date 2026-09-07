import { getApiUrl } from 'common/api/utils'
import { SportsLiveScore } from 'common/sports-schedule'
import { LOCAL_DEV, log } from 'shared/utils'

/**
 * The scheduler has no browser sockets and production Redis is disabled.
 * Hand committed scores to the API writer, which owns the websocket server.
 * Delivery is bounded and best-effort; an unavailable API must not prevent
 * resolution or updates to the remaining games.
 */
export async function publishSportsLiveScore(
  contractId: string,
  score: SportsLiveScore
): Promise<void> {
  // A local scheduler must never send ticks to the deployed API.
  if (LOCAL_DEV) return
  const apiSecret = process.env.API_SECRET
  if (!apiSecret) {
    log.error('[sports-live] API_SECRET missing; skipping score push')
    return
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2_000)
  try {
    const response = await fetch(getApiUrl('internal-sports-broadcast'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiSecret, contractId, score }),
      signal: controller.signal,
    })
    await response.arrayBuffer()
    if (!response.ok) {
      log.error(`[sports-live] push for ${contractId}: HTTP ${response.status}`)
    }
  } catch (error) {
    log.error(`[sports-live] push for ${contractId} failed: ${error}`)
  } finally {
    clearTimeout(timeout)
  }
}
