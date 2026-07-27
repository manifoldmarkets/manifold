import { searchProps } from './market-search-types'

describe('searchProps', () => {
  it('accepts PERP as an exact market type filter', () => {
    const result = searchProps.parse({ contractType: 'PERP' })

    expect(result.contractType).toBe('PERP')
  })
})
