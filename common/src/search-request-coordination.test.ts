import {
  getSearchDiscoveryRetryOptions,
  getSearchDiscoveryRetryMode,
  getLoadMoreRequestAction,
  getSearchRequestDebounceMs,
  SEARCH_ANCHOR_CLOCK_SKEW_ERROR,
  shouldSendDiscoveryOptions,
  shouldRetryStaleSearchRequest,
} from './search-request-coordination'

const legacySchemaError = (field: string) => ({
  errorCode: 400,
  errorMessage: 'Error validating request.',
  errorDetails: [
    {
      field: null,
      error: `Unrecognized key(s) in object: '${field}'`,
    },
  ],
})

describe('discovery compatibility mode', () => {
  it('pins later pages to legacy/control after a first-page fallback', () => {
    expect(shouldSendDiscoveryOptions(false, true)).toBe(false)
  })

  it('keeps treatment options on later pages after an anchor-only fallback', () => {
    expect(shouldSendDiscoveryOptions(false, false)).toBe(true)
  })

  it('allows a new result set to try the current discovery options again', () => {
    expect(shouldSendDiscoveryOptions(true, true)).toBe(true)
    expect(shouldSendDiscoveryOptions(false, false)).toBe(true)
  })
})

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

describe('getSearchDiscoveryRetryMode', () => {
  it('drops only a rejected clock-skewed first-page anchor', () => {
    expect(
      getSearchDiscoveryRetryMode({
        freshQuery: true,
        seenMarketCutoffTime: 1_700_000_000_000,
        enableSemanticSearch: undefined,
        discoveryVariant: 'treatment',
        errorCode: 400,
        errorMessage: SEARCH_ANCHOR_CLOCK_SKEW_ERROR,
        errorDetails: undefined,
        isForYouRoute: true,
      })
    ).toBe('anchor-clock-skew')
  })

  it('does not treat an unrelated 400 as a clock-skew refusal', () => {
    expect(
      getSearchDiscoveryRetryMode({
        freshQuery: true,
        seenMarketCutoffTime: 1_700_000_000_000,
        enableSemanticSearch: undefined,
        discoveryVariant: 'treatment',
        errorCode: 400,
        errorMessage: 'Some other bad request',
        errorDetails: undefined,
        isForYouRoute: true,
      })
    ).toBeUndefined()
  })

  it('does not use the anchor path outside treatment For You', () => {
    expect(
      getSearchDiscoveryRetryMode({
        freshQuery: true,
        seenMarketCutoffTime: 1_700_000_000_000,
        enableSemanticSearch: undefined,
        discoveryVariant: 'control',
        errorCode: 400,
        errorMessage: SEARCH_ANCHOR_CLOCK_SKEW_ERROR,
        errorDetails: undefined,
        isForYouRoute: true,
      })
    ).toBeUndefined()
  })

  it('recognizes a strict old worker rejecting discovery fields', () => {
    expect(
      getSearchDiscoveryRetryMode({
        freshQuery: true,
        seenMarketCutoffTime: 1_700_000_000_000,
        enableSemanticSearch: undefined,
        discoveryVariant: 'treatment',
        ...legacySchemaError('seenMarketCutoffTime'),
        isForYouRoute: true,
      })
    ).toBe('legacy-schema')
  })

  it('can strip an unsupported semantic opt-in on a safe later page', () => {
    expect(
      getSearchDiscoveryRetryMode({
        freshQuery: false,
        seenMarketCutoffTime: undefined,
        enableSemanticSearch: true,
        discoveryVariant: 'treatment',
        ...legacySchemaError('enableSemanticSearch'),
      })
    ).toBe('legacy-schema')
  })

  it('does not mix filtered and unfiltered pagination spaces', () => {
    expect(
      getSearchDiscoveryRetryMode({
        freshQuery: false,
        seenMarketCutoffTime: 1_700_000_000_000,
        enableSemanticSearch: undefined,
        discoveryVariant: 'treatment',
        ...legacySchemaError('seenMarketCutoffTime'),
      })
    ).toBeUndefined()
  })

  it('lets control retry an old worker without changing ranking spaces', () => {
    expect(
      getSearchDiscoveryRetryMode({
        freshQuery: false,
        seenMarketCutoffTime: undefined,
        enableSemanticSearch: undefined,
        discoveryVariant: 'control',
        ...legacySchemaError('discoveryVariant'),
        isForYouRoute: true,
      })
    ).toBe('legacy-schema')
  })

  it('does not switch treatment For You ranking spaces after page one', () => {
    expect(
      getSearchDiscoveryRetryMode({
        freshQuery: false,
        seenMarketCutoffTime: undefined,
        enableSemanticSearch: undefined,
        discoveryVariant: 'treatment',
        ...legacySchemaError('discoveryVariant'),
        isForYouRoute: true,
      })
    ).toBeUndefined()
  })

  it('does not retry unrelated failures or unrelated schema errors', () => {
    expect(
      getSearchDiscoveryRetryMode({
        freshQuery: true,
        seenMarketCutoffTime: 1_700_000_000_000,
        enableSemanticSearch: undefined,
        discoveryVariant: 'treatment',
        errorCode: 500,
        errorMessage: SEARCH_ANCHOR_CLOCK_SKEW_ERROR,
        errorDetails: undefined,
      })
    ).toBeUndefined()
    expect(
      getSearchDiscoveryRetryMode({
        freshQuery: true,
        seenMarketCutoffTime: undefined,
        enableSemanticSearch: true,
        discoveryVariant: 'treatment',
        ...legacySchemaError('someOtherField'),
      })
    ).toBeUndefined()
  })
})

describe('getSearchDiscoveryRetryOptions', () => {
  const treatmentOptions = {
    enableSemanticSearch: true,
    discoveryVariant: 'treatment' as const,
  }

  it('preserves treatment while removing a rejected anchor', () => {
    expect(
      getSearchDiscoveryRetryOptions('anchor-clock-skew', treatmentOptions)
    ).toEqual({
      seenMarketCutoffTime: undefined,
      enableSemanticSearch: true,
      discoveryVariant: 'treatment',
    })
  })

  it('removes every discovery field only for an old schema', () => {
    expect(
      getSearchDiscoveryRetryOptions('legacy-schema', treatmentOptions)
    ).toEqual({
      seenMarketCutoffTime: undefined,
      enableSemanticSearch: undefined,
      discoveryVariant: undefined,
    })
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
