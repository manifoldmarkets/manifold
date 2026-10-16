import { getApiUrl } from 'common/api/utils'
import { SPORTS_SCHEDULE_PAGE_SIZE } from 'common/sports-game-feed'
import { selectSportsOgMarket, SportsOgMarket } from 'common/sports-og'

/** Server-side only: snapshot the same first page used by the sports feed. */
export async function loadSportsOgMarket(
  fetcher: typeof fetch = fetch
): Promise<SportsOgMarket | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4000)
  try {
    const url = new URL(getApiUrl('sports-schedule'))
    url.search = new URLSearchParams({
      sport: 'all',
      limit: String(SPORTS_SCHEDULE_PAGE_SIZE),
      includeRelated: 'false',
    }).toString()
    const response = await fetcher(url, {
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`Sports schedule HTTP ${response.status}`)
    const snapshot: unknown = await response.json()
    return selectSportsOgMarket(snapshot)
  } catch (error) {
    console.warn('Could not load sports preview market', error)
    return null
  } finally {
    clearTimeout(timeout)
  }
}
