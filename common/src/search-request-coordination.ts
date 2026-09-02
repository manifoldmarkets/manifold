const TERM_CHANGE_DEBOUNCE_MS = 300
const OTHER_SEARCH_CHANGE_DEBOUNCE_MS = 50

/**
 * Term changes wait for a typing burst to settle, including before the first
 * request succeeds. Blank initial browse loads and filter-only changes stay
 * responsive.
 */
export const getSearchRequestDebounceMs = (
  currentQuery: string,
  lastCompletedQuery: string | undefined
) =>
  currentQuery !== (lastCompletedQuery ?? '')
    ? TERM_CHANGE_DEBOUNCE_MS
    : OTHER_SEARCH_CHANGE_DEBOUNCE_MS
