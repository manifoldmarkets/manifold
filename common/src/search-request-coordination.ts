const TERM_CHANGE_DEBOUNCE_MS = 300
const OTHER_SEARCH_CHANGE_DEBOUNCE_MS = 50

/**
 * Term changes wait for a typing burst to settle, including before the first
 * request succeeds. Blank or deep-linked initial loads and filter-only changes
 * stay responsive.
 *
 * The baseline is the last query the client already committed to: the last
 * completed one, else the query the page mounted with. A query that arrived
 * with the URL was never typed, so it must not wait like a keystroke.
 *
 * lastCompletedQuery must be a completion from the current mount. A value
 * remembered from an earlier visit would make a deep-linked query look typed.
 */
export const getSearchRequestDebounceMs = (
  currentQuery: string,
  lastCompletedQuery: string | undefined,
  initialQuery: string | undefined
) =>
  currentQuery !== (lastCompletedQuery ?? initialQuery ?? '')
    ? TERM_CHANGE_DEBOUNCE_MS
    : OTHER_SEARCH_CHANGE_DEBOUNCE_MS

export const SEARCH_ANCHOR_CLOCK_SKEW_ERROR =
  'seenMarketCutoffTime is too far ahead of server time'

export type SearchDiscoveryRetryMode = 'anchor-clock-skew' | 'legacy-schema'

const DISCOVERY_OPTION_NAMES = [
  'seenMarketCutoffTime',
  'enableSemanticSearch',
  'discoveryVariant',
] as const

const isLegacyDiscoverySchemaError = (details: unknown) =>
  Array.isArray(details) &&
  details.some((issue) => {
    if (typeof issue !== 'object' || issue === null) return false
    const { field, error } = issue as { field?: unknown; error?: unknown }
    if (typeof error !== 'string' || !/unrecognized|unknown/i.test(error)) {
      return false
    }
    return DISCOVERY_OPTION_NAMES.some(
      (option) => field === option || error.includes(option)
    )
  })

/**
 * Distinguish the new API's explicit clock-skew refusal from an old strict
 * worker rejecting discovery fields. The former only drops the first-page
 * anchor and remains in treatment. The latter drops all discovery fields and
 * pins subsequent pages to legacy behavior.
 *
 * Removing a seen-market anchor is safe only on page one. Removing an
 * experiment arm later is also unsafe for treatment For You because it can
 * switch ranking spaces underneath offset pagination.
 */
export const getSearchDiscoveryRetryMode = (args: {
  freshQuery: boolean
  seenMarketCutoffTime: number | undefined
  enableSemanticSearch: boolean | undefined
  discoveryVariant: 'control' | 'treatment' | undefined
  errorCode: number | undefined
  errorMessage: string | undefined
  errorDetails: unknown
  isForYouRoute?: boolean
}): SearchDiscoveryRetryMode | undefined => {
  const {
    freshQuery,
    seenMarketCutoffTime,
    enableSemanticSearch,
    discoveryVariant,
    errorCode,
    errorMessage,
    errorDetails,
    isForYouRoute = false,
  } = args
  if (errorCode !== 400) return undefined

  if (
    freshQuery &&
    isForYouRoute &&
    discoveryVariant === 'treatment' &&
    seenMarketCutoffTime !== undefined &&
    errorMessage === SEARCH_ANCHOR_CLOCK_SKEW_ERROR
  ) {
    return 'anchor-clock-skew'
  }

  const sentDiscoveryOption =
    seenMarketCutoffTime !== undefined ||
    enableSemanticSearch === true ||
    discoveryVariant !== undefined
  if (
    !sentDiscoveryOption ||
    errorMessage !== 'Error validating request.' ||
    !isLegacyDiscoverySchemaError(errorDetails)
  ) {
    return undefined
  }

  const canDropAnchor = freshQuery || seenMarketCutoffTime === undefined
  const canDropVariant =
    discoveryVariant === undefined ||
    freshQuery ||
    !isForYouRoute ||
    discoveryVariant === 'control'
  return canDropAnchor && canDropVariant ? 'legacy-schema' : undefined
}

export const getSearchDiscoveryRetryOptions = (
  mode: SearchDiscoveryRetryMode,
  options: {
    enableSemanticSearch: boolean | undefined
    discoveryVariant: 'control' | 'treatment' | undefined
  }
) =>
  mode === 'anchor-clock-skew'
    ? {
        seenMarketCutoffTime: undefined,
        enableSemanticSearch: options.enableSemanticSearch,
        discoveryVariant: options.discoveryVariant,
      }
    : {
        seenMarketCutoffTime: undefined,
        enableSemanticSearch: undefined,
        discoveryVariant: undefined,
      }

/** Keep every page in the same ranking space after a compatibility retry. */
export const shouldSendDiscoveryOptions = (
  freshQuery: boolean,
  resultSetUsedCompatibilityFallback: boolean
) => freshQuery || !resultSetUsedCompatibilityFallback

/** Keep one visibility-observer chain alive after params invalidate a page. */
export const shouldRetryStaleSearchRequest = (
  freshQuery: boolean,
  requestParamsGeneration: number,
  currentParamsGeneration: number
) => !freshQuery && requestParamsGeneration !== currentParamsGeneration

/** Decide whether an intersection observer should page, wait, or stop. */
export const getLoadMoreRequestAction = (
  freshRequestPending: boolean,
  searchParamsChanged: boolean,
  failedParamsGeneration: number | undefined,
  currentParamsGeneration: number
): 'load' | 'wait' | 'stop' => {
  if (freshRequestPending) return 'wait'
  if (!searchParamsChanged) return 'load'
  return failedParamsGeneration === currentParamsGeneration ? 'stop' : 'wait'
}
