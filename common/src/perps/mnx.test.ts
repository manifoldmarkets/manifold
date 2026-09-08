import { DAY_MS, MINUTE_MS } from '../util/time'
import {
  MNX_INSTRUMENTS,
  getMnxTradingPauseReason,
  OracleFeedHealth,
} from './mnx'
import { getPerpOracleFreshness } from './oracle'
import { getOracleAttribution } from './oracle-attribution'
import { formatOraclePrice, formatOraclePriceTick } from './oracle-display'
import { getPerpQuote, mergePerpQuotes } from './quote'
import { PerpContract } from '../contract'

const now = 1_800_000_000_000
const health: OracleFeedHealth = {
  checkedAt: now,
  status: 'available',
  priceTime: now,
  price: 2104,
}
const contract = {
  oracleFeedId: 'mnx-anthropic-mark',
  oraclePrice: 2104,
  oraclePriceTime: now,
  oracleFeedHealth: health,
  maxOraclePriceAgeMs: 5 * MINUTE_MS,
}

it('defines precisely the agreed 16 markets with permanent MNX attribution', () => {
  expect(MNX_INSTRUMENTS).toHaveLength(16)
  expect(new Set(MNX_INSTRUMENTS.map((i) => i.feedId)).size).toBe(16)
  expect(MNX_INSTRUMENTS.map((i) => i.symbol)).not.toContain('NVDA')
  for (const spec of MNX_INSTRUMENTS)
    expect(getOracleAttribution(spec.feedId)).toEqual({
      source: 'MNX',
      url: `https://app.mnx.fi/trade/${spec.slug}`,
      showAsOf: true,
    })
})

it('preserves billion-dollar units throughout price formatting', () => {
  expect(formatOraclePrice(contract.oracleFeedId, 2104, 0)).toBe('$2,104B')
  expect(formatOraclePriceTick(contract.oracleFeedId, 2104, 1)).toBe('$2,104B')
  expect(formatOraclePrice('mnx-h100-mark', 3.26, 2)).toBe('$3.26')
  expect(formatOraclePrice('unknown', 2104, 0)).toBe('2,104')
})

it('requires provider availability and the exact applied price', () => {
  expect(getMnxTradingPauseReason(contract, now)).toBeNull()
  expect(
    getMnxTradingPauseReason({ ...contract, oracleFeedHealth: undefined }, now)
  ).toMatch(/checks/)
  expect(
    getMnxTradingPauseReason(
      {
        ...contract,
        oracleFeedHealth: {
          ...health,
          status: 'unavailable',
          reason: 'Frozen',
        },
      },
      now
    )
  ).toBe('Frozen')
  expect(
    getMnxTradingPauseReason({ ...contract, oraclePrice: 2103 }, now)
  ).toMatch(/applied/)
  expect(
    getMnxTradingPauseReason({ ...contract, oraclePriceTime: now - 1 }, now)
  ).toMatch(/applied/)
  expect(getMnxTradingPauseReason(contract, now + 5 * MINUTE_MS + 1)).toMatch(
    /checks/
  )
  expect(
    getMnxTradingPauseReason(
      { ...contract, oracleFeedId: 'btc-usd', oracleFeedHealth: undefined },
      now
    )
  ).toBeNull()
})

it('accepts hourly H100 marks but never extends a stopped collector to 24h', () => {
  const h100 = {
    ...contract,
    oracleFeedId: 'mnx-h100-mark',
    maxOraclePriceAgeMs: DAY_MS,
    oraclePriceTime: now - 60 * MINUTE_MS,
    oracleFeedHealth: { ...health, priceTime: now - 60 * MINUTE_MS },
  }
  expect(getPerpOracleFreshness(h100, now).status).toBe('fresh')
  expect(getPerpOracleFreshness(h100, now + 5 * MINUTE_MS + 1).status).toBe(
    'stale'
  )
  expect(
    getPerpOracleFreshness(
      {
        ...h100,
        oraclePriceTime: now - DAY_MS - 1,
        oracleFeedHealth: { ...health, priceTime: now - DAY_MS - 1 },
      },
      now
    ).status
  ).toBe('stale')
  expect(
    getPerpOracleFreshness(
      {
        ...h100,
        oracleFeedHealth: { ...h100.oracleFeedHealth, status: 'unavailable' },
      },
      now
    ).status
  ).toBe('stale')
})

it('does not let quote reordering erase a freeze or rewind price', () => {
  const first = getPerpQuote({
    ...contract,
    id: 'c',
    poolLong: 25000,
    poolShort: 25000,
  } as PerpContract)
  const frozen = {
    ...first,
    oracleFeedHealth: {
      ...health,
      checkedAt: now + 1,
      status: 'unavailable' as const,
    },
  }
  const merged = mergePerpQuotes(first, frozen)
  expect(merged.oracleFeedHealth?.status).toBe('unavailable')
  expect(mergePerpQuotes(merged, first).oracleFeedHealth?.status).toBe(
    'unavailable'
  )
  const newerPrice = { ...first, oraclePrice: 2200, oraclePriceTime: now + 2 }
  const latest = mergePerpQuotes(merged, newerPrice)
  expect(latest.oraclePrice).toBe(2200)
  expect(latest.oracleFeedHealth?.status).toBe('unavailable')
  const recovery = {
    ...newerPrice,
    oracleFeedHealth: {
      ...health,
      checkedAt: now + 3,
      price: 2200,
      priceTime: now + 2,
    },
  }
  expect(mergePerpQuotes(latest, recovery).oracleFeedHealth?.status).toBe(
    'available'
  )
})
