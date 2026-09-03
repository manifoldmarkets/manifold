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

/**
 * New discovery request fields can be rejected by an old strict API worker,
 * and a new worker deliberately rejects a badly skewed first-page anchor.
 * Removing a semantic opt-in is safe on any later page because fallback only
 * runs on page one. Removing a seen-market anchor is safe only on page one;
 * doing that later could mix filtered and unfiltered offset spaces.
 */
export const shouldRetrySearchWithoutDiscoveryOptions = (
  freshQuery: boolean,
  seenMarketCutoffTime: number | undefined,
  enableSemanticSearch: boolean | undefined,
  errorCode: number | undefined
) =>
  errorCode === 400 &&
  ((freshQuery && seenMarketCutoffTime !== undefined) ||
    enableSemanticSearch === true)

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
