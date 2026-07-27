import { Contract, PerpContract } from './contract'
import { getContractOGProps, getSeoDescription } from './contract-seo'

describe('perpetual market external metadata', () => {
  it('identifies a perp and formats its finite oracle price', () => {
    const contract = getPerpContract(42.125)

    expect(getContractOGProps(contract)).toEqual(
      expect.objectContaining({
        outcomeType: 'PERP',
        perpPrice: '42.125',
        probability: undefined,
        numericValue: undefined,
      })
    )
    expect(getSeoDescription(contract)).toBe(
      'Perpetual market. Oracle price: 42.125. Tracks the underlying asset.'
    )
  })

  it('describes a resolved perp using its immutable settlement price', () => {
    const contract = getPerpContract(42.125, {
      isResolved: true,
      resolution: 'MKT',
      resolvedOraclePrice: 41.5,
    })

    expect(getContractOGProps(contract)).toEqual(
      expect.objectContaining({ perpPrice: '41.500' })
    )
    expect(getSeoDescription(contract)).toBe(
      'Perpetual market settled at 41.500. Tracks the underlying asset.'
    )
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'never serializes a non-finite oracle price (%s)',
    (oraclePrice) => {
      const contract = getPerpContract(oraclePrice, { resolution: 'MKT' })
      const ogProps = getContractOGProps(contract)
      const seoDescription = getSeoDescription(contract)

      expect(ogProps).toEqual(
        expect.objectContaining({
          outcomeType: 'PERP',
          probability: undefined,
          numericValue: undefined,
        })
      )
      expect(ogProps).not.toHaveProperty('perpPrice')
      expect(seoDescription).toBe(
        'Perpetual market. Tracks the underlying asset.'
      )
      expect(seoDescription).not.toMatch(/NaN|Infinity|chance|%/)
    }
  )

  it('preserves binary OG metadata', () => {
    const contract = getBinaryContract()

    expect(getContractOGProps(contract)).toEqual({
      question: 'Will this happen?',
      numTraders: '7',
      volume: '1234',
      probability: '50%',
      creatorName: 'Test Creator',
      creatorAvatarUrl: undefined,
      numericValue: undefined,
      resolution: undefined,
      topAnswer: undefined,
      bountyLeft: undefined,
    })
    expect(getSeoDescription(contract)).toBe(
      '50% chance. A binary market description.'
    )
  })
})

function getPerpContract(
  oraclePrice: number,
  overrides: Partial<PerpContract> = {}
): PerpContract {
  return {
    question: 'Underlying asset price',
    description: 'Tracks the underlying asset.',
    creatorName: 'Test Creator',
    outcomeType: 'PERP',
    oraclePrice,
    uniqueBettorCount: 12,
    volume: 9876.54,
    ...overrides,
  } as unknown as PerpContract
}

function getBinaryContract(): Contract {
  return {
    question: 'Will this happen?',
    description: 'A binary market description.',
    creatorName: 'Test Creator',
    outcomeType: 'BINARY',
    mechanism: 'cpmm-1',
    pool: { YES: 100, NO: 100 },
    p: 0.5,
    uniqueBettorCount: 7,
    volume: 1234.9,
  } as unknown as Contract
}
