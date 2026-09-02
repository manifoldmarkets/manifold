import { getSearchRequestDebounceMs } from './search-request-coordination'

describe('getSearchRequestDebounceMs', () => {
  it('keeps the initial blank browse request responsive', () => {
    expect(getSearchRequestDebounceMs('', undefined)).toBe(50)
  })

  it('debounces a nonblank query before any request has completed', () => {
    expect(getSearchRequestDebounceMs('climate', undefined)).toBe(300)
  })

  it('continues debouncing changed prefixes while the first request is pending', () => {
    expect(getSearchRequestDebounceMs('clim', undefined)).toBe(300)
    expect(getSearchRequestDebounceMs('clima', undefined)).toBe(300)
  })

  it('debounces a term changed from the last completed request', () => {
    expect(getSearchRequestDebounceMs('climate', 'weather')).toBe(300)
  })

  it('keeps filter-only changes responsive', () => {
    expect(getSearchRequestDebounceMs('climate', 'climate')).toBe(50)
  })
})
