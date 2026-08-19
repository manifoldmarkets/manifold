import { z } from 'zod'

import { API } from 'common/api/schema'
import { PerpContract } from 'common/contract'
import { MIN_PERP_LEVERAGE } from 'common/perps/amm'
import {
  PERP_IMPACT_K_DEFAULT,
  PERP_TAKER_FEE_BPS_DEFAULT,
} from 'common/perps/fees'
import {
  createPerpSchema,
  LiteMarket,
  placePerpTradeSchema,
  toFullMarket,
  toLiteMarket,
  toUltraLiteMarket,
} from './market-types'

describe('createPerpSchema', () => {
  const validPerp = {
    question: 'Test perpetual',
    oracleFeedId: 'test-feed',
    maxLeverage: 10,
    maxFundingRate: 0.01,
    fundingSensitivity: 1,
    maxOraclePriceAgeMs: 60_000,
    subsidyLong: 100,
    subsidyShort: 100,
  }

  it('requires the per-period funding cap to be strictly below one', () => {
    expect(
      createPerpSchema.safeParse({
        ...validPerp,
        maxFundingRate: 1 - Number.EPSILON,
      }).success
    ).toBe(true)
    expect(
      createPerpSchema.safeParse({ ...validPerp, maxFundingRate: 1 }).success
    ).toBe(false)
  })
})

describe('placePerpTradeSchema', () => {
  const base = {
    contractId: 'c1',
    direction: 'long' as const,
    mana: 100,
    idempotencyKey: 'useandom26',
  }

  it('accepts leverage at and above the floor', () => {
    expect(
      placePerpTradeSchema.safeParse({ ...base, leverage: MIN_PERP_LEVERAGE })
        .success
    ).toBe(true)
    expect(
      placePerpTradeSchema.safeParse({ ...base, leverage: 10 }).success
    ).toBe(true)
  })

  it('rejects sub-floor leverage, including subnormals that overflow the liquidation-price formula', () => {
    for (const leverage of [0, -1, 0.78125, 1e-320, Number.MIN_VALUE, NaN]) {
      expect(
        placePerpTradeSchema.safeParse({ ...base, leverage }).success
      ).toBe(false)
    }
  })
})

describe('toUltraLiteMarket', () => {
  it('exposes finite perp price and current backing without a liquidity tier', () => {
    const market = getLiteMarket({
      outcomeType: 'PERP',
      mechanism: 'perp',
      oraclePrice: 42.125,
      poolLong: 125.5,
      poolShort: 74.5,
      totalLiquidity: 100_000,
      probability: undefined,
    })

    expect(toUltraLiteMarket(market)).toEqual(
      expect.objectContaining({
        outcomeType: 'PERP',
        oraclePrice: 42.125,
        backingPool: 200,
      })
    )
    expect(toUltraLiteMarket(market)).not.toHaveProperty('liquidityTier')
  })

  it.each([
    {
      name: 'non-finite price',
      values: {
        oraclePrice: Number.POSITIVE_INFINITY,
        poolLong: 125,
        poolShort: 75,
      },
      missing: ['oraclePrice'],
    },
    {
      name: 'non-finite pool',
      values: { oraclePrice: 42, poolLong: Number.NaN, poolShort: 75 },
      missing: ['backingPool'],
    },
    {
      name: 'negative pool',
      values: { oraclePrice: 42, poolLong: -1, poolShort: 75 },
      missing: ['backingPool'],
    },
    {
      name: 'overflowing pool sum',
      values: {
        oraclePrice: 42,
        poolLong: Number.MAX_VALUE,
        poolShort: Number.MAX_VALUE,
      },
      missing: ['backingPool'],
    },
  ])('omits unsafe perp values for $name', ({ values, missing }) => {
    const projected = toUltraLiteMarket(
      getLiteMarket({
        outcomeType: 'PERP',
        mechanism: 'perp',
        ...values,
      })
    )

    for (const field of missing) {
      expect(projected).not.toHaveProperty(field)
    }
    expect(projected).not.toHaveProperty('liquidityTier')
  })

  it('preserves the existing non-perp projection', () => {
    expect(toUltraLiteMarket(getLiteMarket())).toEqual({
      id: 'market-id',
      url: 'https://manifold.markets/test/market',
      creatorId: 'creator-id',
      creatorName: 'Test Creator',
      creatorUsername: 'test',
      answers: undefined,
      question: 'Will this happen?',
      probability: 0.5,
      liquidityTier: 'low',
      outcomeType: 'BINARY',
      volume: 12,
      volume24Hours: 2,
      isResolved: false,
      resolution: undefined,
      resolutionTime: undefined,
      createdTime: '2023-11-14T22:13:20.000Z',
      uniqueBettorCount: 4,
    })
  })
})

describe('toLiteMarket', () => {
  it('exposes the live and final fields needed by the perp page poll', () => {
    const contract = {
      id: 'perp-id',
      creatorId: 'creator-id',
      creatorUsername: 'test',
      creatorName: 'Test Creator',
      createdTime: 1_700_000_000_000,
      question: 'Test perpetual',
      slug: 'test-perpetual',
      outcomeType: 'PERP',
      mechanism: 'perp',
      volume: 100,
      volume24Hours: 25,
      isResolved: true,
      resolution: 'MKT',
      resolutionTime: 1_700_000_100_000,
      resolverId: 'resolver-id',
      uniqueBettorCount: 5,
      oraclePrice: 42,
      oraclePriceTime: 1_700_000_090_000,
      oracleSourceTime: 1_700_000_085_000,
      poolLong: 0,
      poolShort: 0,
      fundingRate: 0.001,
      lastFundingTime: 1_700_000_080_000,
      maxLeverage: 10,
      takerFeeBps: 12,
      impactK: 90,
      resolvedOraclePrice: 42,
      description: '',
    } as unknown as PerpContract

    expect(toLiteMarket(contract)).toEqual(
      expect.objectContaining({
        isResolved: true,
        resolution: 'MKT',
        resolutionTime: 1_700_000_100_000,
        resolverId: 'resolver-id',
        oraclePrice: 42,
        oraclePriceTime: 1_700_000_090_000,
        oracleSourceTime: 1_700_000_085_000,
        poolLong: 0,
        poolShort: 0,
        fundingRate: 0.001,
        lastFundingTime: 1_700_000_080_000,
        takerFeeBps: 12,
        impactK: 90,
        resolvedOraclePrice: 42,
      })
    )
    expect(toFullMarket(contract).takerFeeBps).toBe(12)
    expect(toFullMarket(contract).impactK).toBe(90)
  })

  it('projects the effective legacy default while preserving explicit zero', () => {
    const legacyContract = {
      id: 'legacy-perp-id',
      creatorId: 'creator-id',
      creatorUsername: 'test',
      creatorName: 'Test Creator',
      createdTime: 1_700_000_000_000,
      question: 'Legacy perpetual',
      slug: 'legacy-perpetual',
      outcomeType: 'PERP',
      mechanism: 'perp',
      volume: 0,
      volume24Hours: 0,
      isResolved: false,
      uniqueBettorCount: 0,
      oraclePrice: 42,
      poolLong: 100,
      poolShort: 100,
      description: '',
    } as unknown as PerpContract

    expect(toLiteMarket(legacyContract).takerFeeBps).toBe(
      PERP_TAKER_FEE_BPS_DEFAULT
    )
    expect(toFullMarket(legacyContract).takerFeeBps).toBe(
      PERP_TAKER_FEE_BPS_DEFAULT
    )
    expect(
      toLiteMarket({ ...legacyContract, takerFeeBps: 0 }).takerFeeBps
    ).toBe(0)
    expect(toLiteMarket(legacyContract).impactK).toBe(PERP_IMPACT_K_DEFAULT)
    expect(toLiteMarket({ ...legacyContract, impactK: 0 }).impactK).toBe(0)
    expect(toLiteMarket({ ...legacyContract, impactK: 90 }).impactK).toBe(90)
  })
})

function getLiteMarket(overrides: Partial<LiteMarket> = {}): LiteMarket {
  return {
    id: 'market-id',
    creatorId: 'creator-id',
    creatorUsername: 'test',
    creatorName: 'Test Creator',
    createdTime: 1_700_000_000_000,
    question: 'Will this happen?',
    slug: 'market',
    url: 'https://manifold.markets/test/market',
    outcomeType: 'BINARY',
    mechanism: 'cpmm-1',
    probability: 0.5,
    totalLiquidity: 100,
    volume: 12.4,
    volume24Hours: 1.6,
    isResolved: false,
    uniqueBettorCount: 4,
    ...overrides,
  }
}

describe('update-perp-config props', () => {
  // The schema lives in schema.ts, but its refine is the kind of guard that
  // silently rots: every optional field has to be listed, and forgetting one
  // makes a request that sets ONLY that field fail as "nothing to update".
  // maxOraclePriceAgeMs shipped that way and would have rejected the exact
  // call the change existed to enable.
  const props = API['update-perp-config'].props

  const optionalFields = Object.keys(
    (props as unknown as { _def: { schema: z.ZodObject<z.ZodRawShape> } })._def
      .schema.shape
  ).filter((k) => k !== 'contractId')

  it('enumerates the tunable fields, so the loop below cannot pass vacuously', () => {
    expect(optionalFields.sort()).toEqual([
      'impactK',
      'maxFundingRate',
      'maxLeverage',
      'maxOraclePriceAgeMs',
      'takerFeeBps',
    ])
  })

  it('accepts each tunable field on its own', () => {
    const sample: Record<string, number> = {
      maxLeverage: 10,
      maxFundingRate: 0.02,
      takerFeeBps: 10,
      impactK: 90,
      maxOraclePriceAgeMs: 10_000,
    }
    for (const field of optionalFields) {
      expect(sample[field]).toBeDefined() // keeps this test honest as fields are added
      const parsed = props.safeParse({
        contractId: 'c1',
        [field]: sample[field],
      })
      expect([field, parsed.success]).toEqual([field, true])
    }
  })

  it('still rejects a request that changes nothing', () => {
    expect(props.safeParse({ contractId: 'c1' }).success).toBe(false)
  })

  it('rejects an out-of-bounds impactK at the schema', () => {
    expect(props.safeParse({ contractId: 'c1', impactK: -1 }).success).toBe(
      false
    )
    expect(
      props.safeParse({ contractId: 'c1', impactK: 10_001 }).success
    ).toBe(false)
  })
})
