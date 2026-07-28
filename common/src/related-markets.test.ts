import {
  isEligibleRelatedMarket,
  materializeEligibleRelatedMarkets,
} from './related-markets'

const NOW = 1_000

const candidate = (
  overrides: Partial<Parameters<typeof isEligibleRelatedMarket>[0]> = {}
) => ({
  closeTime: NOW + 1,
  deleted: false,
  isResolved: false,
  mechanism: 'cpmm-1' as const,
  visibility: 'public' as const,
  ...overrides,
})

describe('isEligibleRelatedMarket', () => {
  it('accepts an active public market', () => {
    expect(isEligibleRelatedMarket(candidate(), NOW)).toBe(true)
  })

  it.each([
    ['unlisted', { visibility: 'unlisted' as const }],
    ['deleted', { deleted: true }],
    ['resolved', { isResolved: true }],
    ['closed', { closeTime: NOW }],
  ])('rejects a %s market', (_label, overrides) => {
    expect(isEligibleRelatedMarket(candidate(overrides), NOW)).toBe(false)
  })

  it('accepts an active no-close PERP but not another no-close mechanism', () => {
    expect(
      isEligibleRelatedMarket(
        candidate({ closeTime: undefined, mechanism: 'perp' }),
        NOW
      )
    ).toBe(true)
    expect(
      isEligibleRelatedMarket(candidate({ closeTime: undefined }), NOW)
    ).toBe(false)
  })
})

describe('materializeEligibleRelatedMarkets', () => {
  const identifiedCandidate = (
    id: string,
    overrides: Partial<Parameters<typeof isEligibleRelatedMarket>[0]> = {}
  ) => ({
    id,
    ...candidate(overrides),
  })

  it('preserves cached rank while dropping missing and newly ineligible IDs', () => {
    const marketIds = [
      'missing',
      'eligible-second',
      'deleted',
      'eligible-first',
      'resolved',
      'unlisted',
      'closed',
      'no-close-non-perp',
    ]
    const currentContracts = [
      identifiedCandidate('eligible-first'),
      identifiedCandidate('unlisted', { visibility: 'unlisted' }),
      identifiedCandidate('deleted', { deleted: true }),
      identifiedCandidate('eligible-second', {
        closeTime: undefined,
        mechanism: 'perp',
      }),
      identifiedCandidate('resolved', { isResolved: true }),
      identifiedCandidate('closed', { closeTime: NOW }),
      identifiedCandidate('no-close-non-perp', { closeTime: undefined }),
    ]

    expect(
      materializeEligibleRelatedMarkets(marketIds, currentContracts, NOW).map(
        (contract) => contract.id
      )
    ).toEqual(['eligible-second', 'eligible-first'])
  })
})
