import {
  getLoadMoreRequestAction,
  getSearchRequestDebounceMs,
  shouldRetrySearchWithoutDiscoveryOptions,
  shouldRetryStaleSearchRequest,
} from './search-request-coordination'

describe('getSearchRequestDebounceMs', () => {
  it('keeps the initial blank browse request responsive', () => {
    expect(getSearchRequestDebounceMs('', undefined, undefined)).toBe(50)
    expect(getSearchRequestDebounceMs('', undefined, '')).toBe(50)
  })

  it('keeps a deep-linked initial query responsive', () => {
    expect(getSearchRequestDebounceMs('climate', undefined, 'climate')).toBe(50)
  })

  it('debounces a typed query before any request has completed', () => {
    expect(getSearchRequestDebounceMs('climate', undefined, '')).toBe(300)
    expect(getSearchRequestDebounceMs('climate', undefined, undefined)).toBe(
      300
    )
  })

  it('continues debouncing changed prefixes while the first request is pending', () => {
    expect(getSearchRequestDebounceMs('clim', undefined, '')).toBe(300)
    expect(getSearchRequestDebounceMs('clima', undefined, '')).toBe(300)
    expect(getSearchRequestDebounceMs('climates', undefined, 'climate')).toBe(
      300
    )
  })

  it('debounces a term changed from the last completed request', () => {
    expect(getSearchRequestDebounceMs('climate', 'weather', '')).toBe(300)
  })

  it('prefers a query completed since mount over the mount query', () => {
    expect(getSearchRequestDebounceMs('climate', 'weather', 'climate')).toBe(
      300
    )
  })

  it('keeps filter-only changes responsive', () => {
    expect(getSearchRequestDebounceMs('climate', 'climate', '')).toBe(50)
    expect(getSearchRequestDebounceMs('climate', 'climate', undefined)).toBe(50)
  })
})

describe('shouldRetrySearchWithoutDiscoveryOptions', () => {
  it('retries a rejected anchored first page without suppression', () => {
    expect(
      shouldRetrySearchWithoutDiscoveryOptions(
        true,
        1_700_000_000_000,
        undefined,
        400
      )
    ).toBe(true)
  })

  it('retries an unsupported semantic-search opt-in on any page', () => {
    expect(
      shouldRetrySearchWithoutDiscoveryOptions(true, undefined, true, 400)
    ).toBe(true)
    expect(
      shouldRetrySearchWithoutDiscoveryOptions(false, undefined, true, 400)
    ).toBe(true)
  })

  it('does not mix filtered and unfiltered pagination spaces', () => {
    expect(
      shouldRetrySearchWithoutDiscoveryOptions(
        false,
        1_700_000_000_000,
        undefined,
        400
      )
    ).toBe(false)
  })

  it('does not retry unrelated failures or requests without new options', () => {
    expect(
      shouldRetrySearchWithoutDiscoveryOptions(
        true,
        1_700_000_000_000,
        undefined,
        500
      )
    ).toBe(false)
    expect(
      shouldRetrySearchWithoutDiscoveryOptions(true, undefined, undefined, 400)
    ).toBe(false)
  })
})

describe('shouldRetryStaleSearchRequest', () => {
  it('retries a load-more request invalidated by new params', () => {
    expect(shouldRetryStaleSearchRequest(false, 1, 2)).toBe(true)
  })

  it('does not fork pagination chains for same-param supersession', () => {
    expect(shouldRetryStaleSearchRequest(false, 2, 2)).toBe(false)
  })

  it('does not retry superseded fresh requests', () => {
    expect(shouldRetryStaleSearchRequest(true, 1, 2)).toBe(false)
  })
})

describe('getLoadMoreRequestAction', () => {
  it('loads only after the current params have a settled fresh result', () => {
    expect(getLoadMoreRequestAction(false, false, undefined, 2)).toBe('load')
    expect(getLoadMoreRequestAction(false, false, 2, 2)).toBe('load')
    expect(getLoadMoreRequestAction(true, false, undefined, 2)).toBe('wait')
    expect(getLoadMoreRequestAction(false, true, undefined, 2)).toBe('wait')
  })

  it('stops polling after the current fresh request fails', () => {
    expect(getLoadMoreRequestAction(false, true, 2, 2)).toBe('stop')
    expect(getLoadMoreRequestAction(false, true, 1, 2)).toBe('wait')
  })

  it('waits while a retry is pending after an earlier failure', () => {
    expect(getLoadMoreRequestAction(true, true, 2, 2)).toBe('wait')
  })
})
