import { isSportsBdlEnabled } from 'common/bdl/rollout'
import { isRegisteredSport } from 'common/bdl/registered-sports'
import { CURATED_SPORTS } from 'common/sports-schedule'
import { getApiUrl } from 'common/api/utils'
import { SPORTS_SCHEDULE_PAGE_SIZE } from 'common/sports-game-feed'
import { selectSportsOgMarket, SportsOgMarket } from 'common/sports-og'

/** Server-side only: snapshot the same first page used by the sports feed. */
export async function loadSportsOgMarket(): Promise<SportsOgMarket | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4000)
  try {
    const url = new URL(getApiUrl('sports-schedule'))
    url.search = new URLSearchParams({
      sport: 'all',
      limit: String(SPORTS_SCHEDULE_PAGE_SIZE),
      includeRelated: 'false',
    }).toString()
    const response = await fetch(url, {
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

export type SportsSharingScope = { key: string; label: string }

/** Curated pages have stable routes. A dynamic family, such as esports,
 * exists only while its public Sports topic is present in the current index. */
export async function loadSportsSharingScope(
  key: unknown
): Promise<SportsSharingScope | null> {
  if (
    !isSportsBdlEnabled() ||
    typeof key !== 'string' ||
    !isRegisteredSport(key)
  )
    return null
  const known = CURATED_SPORTS.find((s) => s.key === key)
  if (known) return { key, label: known.longLabel }
  try {
    const response = await fetch(getApiUrl('sports-index'), {
      signal: AbortSignal.timeout(2000),
      cache: 'no-store',
    })
    if (!response.ok) return null
    const index: unknown = await response.json()
    if (
      !index ||
      typeof index !== 'object' ||
      !('sports' in index) ||
      !Array.isArray(index.sports)
    )
      return null
    const scope: unknown = index.sports.find(
      (s: unknown) =>
        !!s &&
        typeof s === 'object' &&
        'key' in s &&
        s.key === key &&
        'slug' in s &&
        s.slug === key &&
        'groupIds' in s &&
        Array.isArray(s.groupIds) &&
        s.groupIds.some((id) => typeof id === 'string' && id.length > 0)
    )
    if (
      scope &&
      typeof scope === 'object' &&
      'longLabel' in scope &&
      typeof scope.longLabel === 'string'
    ) {
      const label = scope.longLabel.trim()
      if (label && label.length <= 70) return { key, label }
    }
  } catch {
    /* Preserve ordinary sharing metadata when the public index is unavailable. */
  }
  return null
}
