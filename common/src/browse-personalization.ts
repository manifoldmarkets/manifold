// A starting heuristic for choosing a default, not a claim of measured lift.
// Count distinct, deliberately opened public markets, not card impressions,
// repeat views, account age, or money spent. The ranker also needs learned data.
export const FOR_YOU_MIN_MARKET_VIEWS = 20

export type BrowseMode = 'all' | 'for-you'
export type BrowsePersonalization = { eligible: boolean }
export type BrowseParameters = Record<string, string | undefined>

export const hasEnoughBrowseHistory = (
  distinctMarketViews: number,
  hasLearnedInterests: boolean
) =>
  Number.isFinite(distinctMarketViews) &&
  distinctMarketViews >= FOR_YOU_MIN_MARKET_VIEWS &&
  hasLearnedInterests

export const readBrowseMode = (value: unknown): BrowseMode | undefined =>
  value === 'all' || value === 'for-you' ? value : undefined

export const readBrowseParameters = (value: unknown): BrowseParameters => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  )
}

export const canDefaultToForYou = (params: BrowseParameters) =>
  !params.q?.trim() &&
  !params.tf &&
  !params.gids &&
  (!params.s || params.s === 'score' || params.s === 'freshness-score') &&
  params.f !== 'news' &&
  params.sw !== '1'

// Explicit URLs win. Otherwise preserve a saved navigation/filter choice and
// apply the user's All/For You preference before the automatic history rule.
// A persisted fy=0 alone is not an opt-out: it may be yesterday's cold start.
export const getInitialBrowseForYou = (args: {
  params: BrowseParameters
  urlParams: BrowseParameters
  preference?: BrowseMode
  eligible: boolean
}): '0' | '1' => {
  const { params, urlParams, preference, eligible } = args
  if (urlParams.fy === '0' || urlParams.fy === '1') return urlParams.fy
  if (!canDefaultToForYou(params)) return '0'
  if (preference) return preference === 'for-you' ? '1' : '0'
  return eligible ? '1' : '0'
}

// A topic scope and personalized ranking are separate destinations. Keep the
// highlighted tab consistent with the API route, including explicit sorts.
export const normalizeBrowseChange = <T extends BrowseParameters>(
  current: T,
  changes: Partial<T>
): Partial<T> => {
  if (changes.fy === '1') {
    const next = { ...current, ...changes }
    return {
      ...changes,
      tf: '',
      gids: '',
      s: next.s === 'score' || next.s === 'freshness-score' ? next.s : 'score',
      f: next.f === 'news' ? 'open' : next.f,
      sw: next.sw === '1' ? '0' : next.sw,
    }
  }
  if (
    changes.tf !== undefined ||
    changes.gids !== undefined ||
    (changes.s !== undefined &&
      changes.s !== 'score' &&
      changes.s !== 'freshness-score') ||
    changes.f === 'news' ||
    changes.sw === '1'
  ) {
    return { ...changes, fy: '0' }
  }
  return changes
}
