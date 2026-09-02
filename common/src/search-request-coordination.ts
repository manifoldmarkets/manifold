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
