import { MINUTE_MS } from '../util/time'
import { MNX_INSTRUMENTS } from './mnx'
import { OracleFeedHealth } from './oracle-health'
import { getOracleFreshness, getPerpOracleFreshness } from './oracle'
import { getOracleAttribution } from './oracle-attribution'
import { formatOraclePrice, formatOraclePriceTick } from './oracle-display'
import { getPerpQuote, mergePerpQuotes } from './quote'
import { PerpContract } from '../contract'

const now = 1_800_000_000_000
const health: OracleFeedHealth = {
  checkedAt: now,
  status: 'available',
  expiresAt: now + 5 * MINUTE_MS,
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

it('uses provider-neutral health and leaves feeds without health unchanged', () => {
  for (const oracleFeedId of [
    'btc-usd',
    'mnx-anthropic-mark',
    'future-provider',
  ]) {
    const plain = { ...contract, oracleFeedId, oracleFeedHealth: undefined }
    for (const time of [now, now + 6 * MINUTE_MS, now - 4 * MINUTE_MS])
      expect(getPerpOracleFreshness(plain, time)).toEqual(
        getOracleFreshness(
          plain.oraclePriceTime,
          plain.maxOraclePriceAgeMs,
          time
        )
      )
    expect(
      getPerpOracleFreshness({ ...contract, oracleFeedId }, now).status
    ).toBe('fresh')
    expect(
      getPerpOracleFreshness(
        {
          ...contract,
          oracleFeedId,
          oracleFeedHealth: {
            ...health,
            status: 'unavailable',
            reason: 'Frozen',
          },
        },
        now
      ).reason
    ).toBe('Frozen')
  }
  expect(getPerpOracleFreshness(contract, now - 4 * MINUTE_MS).status).toBe(
    'fresh'
  )
  expect(getPerpOracleFreshness(contract, now + 6 * MINUTE_MS).status).toBe(
    'stale'
  )
  expect(
    getPerpOracleFreshness(
      { ...contract, oracleFeedHealth: { ...health, expiresAt: now - 1 } },
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
  expect(mergePerpQuotes(first, { ...first })).toBe(first)
  expect(mergePerpQuotes(merged, first)).toBe(merged)
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
    },
  }
  expect(mergePerpQuotes(latest, recovery).oracleFeedHealth?.status).toBe(
    'available'
  )
})
