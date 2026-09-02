import { getSearchRequestDebounceMs } from './search-request-coordination'

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
