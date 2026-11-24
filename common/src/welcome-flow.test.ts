import type { BinaryContract, MultiContract } from './contract'
import { HOUR_MS } from './util/time'
import {
  getWelcomeSteps,
  normalizeReferrerInput,
  pickFirstBetMarkets,
  shouldSendCachedReferral,
} from './welcome-flow'

describe('getWelcomeSteps', () => {
  it.each([
    [false, false, ['intro', 'first-bet']],
    [false, true, ['intro']],
    [true, false, ['intro']],
    [true, true, ['intro']],
  ] as const)(
    'contract page %s, pending bet %s',
    (onContractPage, hasPendingBet, steps) => {
      expect(getWelcomeSteps({ onContractPage, hasPendingBet })).toEqual(steps)
    }
  )
})

describe('normalizeReferrerInput', () => {
  it.each([
    ['  @Some_Name-1  ', 'Some_Name-1'],
    ['@-foo. bar/#', '-foobar'],
    [' @ ', ''],
    ['a'.repeat(25) + '-123456', 'a'.repeat(25) + '-1234'],
  ])('normalizes %s', (raw, expected) => {
    expect(normalizeReferrerInput(raw)).toBe(expected)
  })
})

describe('shouldSendCachedReferral', () => {
  it.each([
    [false, true, true, true],
    [false, false, true, false],
    [false, true, false, false],
    [undefined, false, true, false],
    [undefined, true, true, true],
    [undefined, true, false, false],
    [true, false, true, true],
    [true, false, false, true], // Step one has saved the name.
  ] as const)(
    'explicit %s, original route %s, past onboarding %s',
    (explicit, onImplicitReferralPage, pastOnboarding, expected) => {
      expect(
        shouldSendCachedReferral({
          explicit,
          onImplicitReferralPage,
          pastOnboarding,
        })
      ).toBe(expected)
    }
  )
})

const now = 100 * HOUR_MS
const binary = (
  id: string,
  changes: Partial<BinaryContract> = {}
): BinaryContract =>
  ({
    id,
    outcomeType: 'BINARY',
    mechanism: 'cpmm-1',
    token: 'MANA',
    visibility: 'public',
    isResolved: false,
    p: 0.5,
    pool: { YES: 50, NO: 50 },
    uniqueBettorCount: 10,
    ...changes,
  } as BinaryContract)

describe('pickFirstBetMarkets', () => {
  it('uses the displayed probability and includes both endpoints', () => {
    const low = binary('low', { pool: { YES: 90, NO: 10 } })
    const high = binary('high', { pool: { YES: 10, NO: 90 } })
    expect(
      pickFirstBetMarkets(
        [
          low,
          high,
          binary('outside', { pool: { YES: 91, NO: 9 } }),
          binary('high-outside', { resolutionProbability: 0.91 }),
          binary('nan', { pool: { YES: 0, NO: 0 } }),
        ],
        now
      )
    ).toEqual([low, high])
  })

  it('requires an open public mana binary with enough time and traders', () => {
    const open = binary('open', { closeTime: now + HOUR_MS + 1 })
    const noClose = binary('no-close')
    const multi: MultiContract = {
      ...binary('multi'),
      mechanism: 'cpmm-multi-2',
      outcomeType: 'MULTIPLE_CHOICE',
      shouldAnswersSumToOne: true,
      answers: [],
    }
    expect(
      pickFirstBetMarkets(
        [
          binary('closing', { closeTime: now + HOUR_MS / 2 }),
          binary('boundary', { closeTime: now + HOUR_MS }),
          binary('invalid-close', { closeTime: Infinity }),
          binary('cash', { token: 'CASH' }),
          binary('unlisted', { visibility: 'unlisted' }),
          binary('deleted', { deleted: true }),
          binary('resolved', { isResolved: true }),
          binary('quiet', { uniqueBettorCount: 9 }),
          binary('invalid-count', { uniqueBettorCount: NaN }),
          multi,
          noClose,
          open,
        ],
        now
      )
    ).toEqual([noClose, open])
  })

  it('deduplicates eligible IDs in input order before applying the limit', () => {
    const first = binary('first')
    const second = binary('second')
    const markets = [
      binary('second', { deleted: true }),
      first,
      binary('first'),
      second,
      binary('third'),
      binary('fourth'),
    ]
    expect(pickFirstBetMarkets(markets, now, 2)).toEqual([first, second])
    expect(pickFirstBetMarkets(markets, now)).toHaveLength(3)
    expect(pickFirstBetMarkets(markets, now, 0)).toEqual([])
  })

  it('uses the supplied minimum trader count and rejects non-finite inputs', () => {
    const quiet = binary('quiet', { uniqueBettorCount: 1 })
    expect(pickFirstBetMarkets([quiet], now, 3, 10)).toEqual([])
    expect(
      pickFirstBetMarkets(
        [quiet, binary('empty', { uniqueBettorCount: 0 })],
        now,
        3,
        1
      )
    ).toEqual([quiet])
    expect(pickFirstBetMarkets([quiet], NaN, 3, 1)).toEqual([])
    expect(pickFirstBetMarkets([quiet], now, Infinity, 1)).toEqual([])
    expect(pickFirstBetMarkets([quiet], now, 3, NaN)).toEqual([])
  })
})
