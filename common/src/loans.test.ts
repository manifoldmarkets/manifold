import { sumBy } from 'lodash'
import { Answer } from './answer'
import { Contract, CPMMMultiContract } from './contract'
import { ContractMetric } from './contract-metric'
import {
  canTakeLoans,
  distributeMarginLoan,
  filterLoanEquityMetrics,
  getMarginLoanCapacity,
  getMarginLoanPositions,
  getMaxPositionLoanToValue,
  getPositionLoanRoom,
  keyContractsWithLiveAnswers,
  LoanDistribution,
  MarginLoanPosition,
  sumExcludedPerpEquity,
} from './loans'

// Build minimal shapes — the helper only reads contractId and mechanism.
const metric = (contractId: string, extra?: Record<string, unknown>) => ({
  contractId,
  ...extra,
})

const contractsById = {
  perp1: { mechanism: 'perp' as const, token: 'MANA' as const },
  perp2: { mechanism: 'perp' as const, token: 'MANA' as const },
  cashPerp: { mechanism: 'perp' as const, token: 'CASH' as const },
  binary: { mechanism: 'cpmm-1' as const, token: 'MANA' as const },
  multi: { mechanism: 'cpmm-multi-1' as const, token: 'MANA' as const },
}

describe('canTakeLoans', () => {
  // Loans are borrowed against the user's own positions, so never-verified
  // accounts can take them like everyone else in good standing.
  it('allows never-verified users (bonusEligibility undefined)', () => {
    expect(canTakeLoans({})).toBe(true)
  })

  it('allows verified, grandfathered, and purchase/admin-granted users', () => {
    expect(canTakeLoans({ bonusEligibility: 'verified' })).toBe(true)
    expect(canTakeLoans({ bonusEligibility: 'grandfathered' })).toBe(true)
    expect(canTakeLoans({ bonusEligibility: 'eligible' })).toBe(true)
  })

  it('blocks admin-flagged accounts pending review', () => {
    expect(canTakeLoans({ bonusEligibility: 'requires_verification' })).toBe(
      false
    )
  })

  // 'ineligible' is written by superBanUserCore alongside permanent bans (and,
  // on older rows, by failed/expired iDenfy sessions). Allowing it would hand
  // loans back to superbanned accounts.
  it('blocks explicitly-ineligible accounts (superban, legacy failed KYC)', () => {
    expect(canTakeLoans({ bonusEligibility: 'ineligible' })).toBe(false)
  })

  // Bots self-exclude from bonuses, but that exclusion lives on isBot and the
  // bonus predicates — it must not reach through to borrowing. An unverified
  // bot borrows; the deny states still apply, bot or not.
  it('ignores bot status', () => {
    expect(canTakeLoans({ isBot: true } as any)).toBe(true)
    expect(
      canTakeLoans({ isBot: true, bonusEligibility: 'verified' } as any)
    ).toBe(true)
    expect(
      canTakeLoans({ isBot: true, bonusEligibility: 'ineligible' } as any)
    ).toBe(false)
    expect(
      canTakeLoans({
        isBot: true,
        bonusEligibility: 'requires_verification',
      } as any)
    ).toBe(false)
  })
})

describe('filterLoanEquityMetrics', () => {
  it('excludes perp positions from loan equity', () => {
    const metrics = [
      metric('perp1'),
      metric('binary'),
      metric('multi'),
      metric('perp2'),
    ]
    const result = filterLoanEquityMetrics(metrics, contractsById)
    expect(result.map((m) => m.contractId)).toEqual(['binary', 'multi'])
  })

  it('returns all metrics when none are perps', () => {
    const metrics = [metric('binary'), metric('multi')]
    expect(filterLoanEquityMetrics(metrics, contractsById)).toEqual(metrics)
  })

  it('returns empty for all-perp portfolios', () => {
    const metrics = [metric('perp1'), metric('perp2')]
    expect(filterLoanEquityMetrics(metrics, contractsById)).toEqual([])
  })

  it('keeps metrics whose contract is missing from the map', () => {
    const metrics = [metric('unknown'), metric('perp1')]
    const result = filterLoanEquityMetrics(metrics, contractsById)
    expect(result.map((m) => m.contractId)).toEqual(['unknown'])
  })

  it('preserves metric fields and order', () => {
    const metrics = [
      metric('multi', { answerId: 'a', payout: 100 }),
      metric('perp1', { payout: 5000 }),
      metric('binary', { payout: 50 }),
    ]
    const result = filterLoanEquityMetrics(metrics, contractsById)
    expect(result).toEqual([
      { contractId: 'multi', answerId: 'a', payout: 100 },
      { contractId: 'binary', payout: 50 },
    ])
  })
})

describe('sumExcludedPerpEquity', () => {
  it('sums the perp payout left out of the equity base', () => {
    const metrics = [
      metric('perp1', { payout: 5000 }),
      metric('binary', { payout: 50 }),
      metric('perp2', { payout: 250 }),
    ]
    expect(sumExcludedPerpEquity(metrics, contractsById)).toEqual(5250)
  })

  it('is zero when the portfolio holds no perps', () => {
    const metrics = [metric('binary', { payout: 50 }), metric('multi', {})]
    expect(sumExcludedPerpEquity(metrics, contractsById)).toEqual(0)
  })

  it('only counts perps of the requested token', () => {
    const metrics = [
      metric('perp1', { payout: 100 }),
      metric('cashPerp', { payout: 900 }),
    ]
    expect(sumExcludedPerpEquity(metrics, contractsById)).toEqual(100)
    expect(sumExcludedPerpEquity(metrics, contractsById, 'CASH')).toEqual(900)
  })

  it('ignores non-finite payouts rather than returning NaN', () => {
    const metrics = [
      metric('perp1', { payout: NaN }),
      metric('perp2', { payout: 300 }),
    ]
    expect(sumExcludedPerpEquity(metrics, contractsById)).toEqual(300)
  })

  it('never reports a negative excluded value', () => {
    const metrics = [metric('perp1', { payout: -40 })]
    expect(sumExcludedPerpEquity(metrics, contractsById)).toEqual(0)
  })

  it('agrees with what filterLoanEquityMetrics drops', () => {
    const metrics = [
      metric('perp1', { payout: 700 }),
      metric('binary', { payout: 50 }),
    ]
    const kept = filterLoanEquityMetrics(metrics, contractsById)
    expect(kept.map((m) => m.contractId)).toEqual(['binary'])
    expect(sumExcludedPerpEquity(metrics, contractsById)).toEqual(700)
  })
})

describe('getMaxPositionLoanToValue', () => {
  // A user at the tier's total limit owes maxLoanPercent × equity, which is
  // maxLoanPercent / (1 + maxLoanPercent) of their portfolio's value.
  it('matches the loan-to-value at each tier limit', () => {
    expect(getMaxPositionLoanToValue(1)).toBeCloseTo(0.5)
    expect(getMaxPositionLoanToValue(2)).toBeCloseTo(2 / 3)
    expect(getMaxPositionLoanToValue(3)).toBeCloseTo(0.75)
  })

  it('stays under 100% so a sale at value always repays the loan', () => {
    for (const percent of [0.1, 1, 10, 1000]) {
      expect(getMaxPositionLoanToValue(percent)).toBeLessThan(1)
    }
  })

  it('is zero for a non-positive or non-finite limit', () => {
    for (const percent of [0, -1, NaN, Infinity, -Infinity]) {
      expect(getMaxPositionLoanToValue(percent)).toBe(0)
    }
  })
})

describe('getPositionLoanRoom', () => {
  it('is the cap minus the loan already owed', () => {
    expect(getPositionLoanRoom({ value: 200, loan: 40 }, 0.5)).toBeCloseTo(60)
  })

  it('is zero once the position owes its cap or more', () => {
    expect(getPositionLoanRoom({ value: 200, loan: 100 }, 0.5)).toBe(0)
    // The reporter's Super Bowl answers: worth ~M$195, owing ~M$575.
    expect(getPositionLoanRoom({ value: 195, loan: 575 }, 0.75)).toBe(0)
  })

  it('makes no room from bad data', () => {
    const cases = [
      { value: NaN, loan: 0 },
      { value: Infinity, loan: 0 },
      { value: 100, loan: NaN },
      { value: 100, loan: Infinity },
      { value: 0, loan: 0 },
      { value: -50, loan: 0 },
    ]
    for (const position of cases) {
      expect(getPositionLoanRoom(position, 0.5)).toBe(0)
    }
    expect(getPositionLoanRoom({ value: 100, loan: 0 }, NaN)).toBe(0)
    expect(getPositionLoanRoom({ value: 100, loan: 0 }, 0)).toBe(0)
  })

  it('makes no room from a negative loan', () => {
    expect(getPositionLoanRoom({ value: 100, loan: -500 }, 0.5)).toBe(0)
  })

  it('never lets a position owe more than it is worth', () => {
    expect(getPositionLoanRoom({ value: 100, loan: 0 }, 3)).toBe(100)
  })
})

const position = (
  contractId: string,
  value: number,
  loan: number,
  answerId: string | null = null
): MarginLoanPosition => ({ contractId, answerId, value, loan })

// Deterministic PRNG (mulberry32) so a failing case reproduces.
const seededRandom = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// Sums per key, as incrementLoanFieldsQuery merges duplicate keys.
const loanByKey = (distributions: LoanDistribution[]) => {
  const byKey: Record<string, number> = {}
  for (const d of distributions) {
    const key = `${d.contractId}-${d.answerId ?? ''}`
    byKey[key] = (byKey[key] ?? 0) + d.loanAmount
  }
  return byKey
}

describe('distributeMarginLoan', () => {
  it('never pushes a position past its cap (randomized)', () => {
    const random = seededRandom(4231)
    for (let trial = 0; trial < 500; trial++) {
      const maxLoanToValue = getMaxPositionLoanToValue(
        1 + Math.floor(random() * 3)
      )
      const positions = Array.from(
        { length: 1 + Math.floor(random() * 12) },
        (_, i) => {
          const value = random() < 0.1 ? 0 : random() * 1000
          // Some positions start over their cap, like the reporter's.
          const loan = random() * value * (random() < 0.3 ? 3 : maxLoanToValue)
          return position(`c${i}`, value, loan)
        }
      )
      const capacity = getMarginLoanCapacity(positions, maxLoanToValue)
      // Includes requests past capacity: those must not overflow either.
      const amount = random() * capacity * 1.5

      const distributions = distributeMarginLoan(
        amount,
        positions,
        maxLoanToValue
      )
      const byKey = loanByKey(distributions)

      for (const p of positions) {
        const added = byKey[`${p.contractId}-`] ?? 0
        expect(added).toBeGreaterThanOrEqual(0)
        if (getPositionLoanRoom(p, maxLoanToValue) === 0) {
          expect(added).toBe(0)
        } else {
          expect(p.loan + added).toBeLessThanOrEqual(
            p.value * maxLoanToValue + 1e-9
          )
        }
      }
      expect(sumBy(distributions, 'loanAmount')).toBeCloseTo(
        Math.min(amount, capacity),
        6
      )
    }
  })

  it('puts nothing on over-loaned positions, everything on ones with room', () => {
    // Six Super Bowl answers owing ~3x their value, plus one clean position.
    const answers = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) =>
      position('superbowl', 195, 575, id)
    )
    const clean = position('binary', 1000, 0)
    expect(distributeMarginLoan(300, [...answers, clean], 0.5)).toEqual([
      { contractId: 'binary', answerId: null, loanAmount: 300 },
    ])
  })

  it('uses up the same share of every position’s room', () => {
    const positions = [
      position('x', 1000, 0), // room 500
      position('y', 400, 100), // room 100
      position('z', 100, 50), // room 0
    ]
    const byKey = loanByKey(distributeMarginLoan(300, positions, 0.5))
    expect(byKey['x-']).toBeCloseTo(250)
    expect(byKey['y-']).toBeCloseTo(50)
    expect(byKey['z-']).toBeUndefined()
  })

  it('weights by value, not cost basis, when nothing is borrowed yet', () => {
    const positions = [position('small', 100, 0), position('large', 300, 0)]
    const byKey = loanByKey(distributeMarginLoan(100, positions, 0.5))
    expect(byKey['small-']).toBeCloseTo(25)
    expect(byKey['large-']).toBeCloseTo(75)
  })

  it('fills every position exactly to its cap at full capacity', () => {
    const positions = [position('x', 1000, 100), position('y', 300, 0)]
    const maxLoanToValue = 0.75
    const capacity = getMarginLoanCapacity(positions, maxLoanToValue)
    expect(capacity).toBeCloseTo(650 + 225)
    const byKey = loanByKey(
      distributeMarginLoan(capacity, positions, maxLoanToValue)
    )
    expect(100 + byKey['x-']).toBeCloseTo(750)
    expect(byKey['y-']).toBeCloseTo(225)
  })

  it('distributes only the capacity when asked for more', () => {
    expect(distributeMarginLoan(1000, [position('x', 100, 0)], 0.5)).toEqual([
      { contractId: 'x', answerId: null, loanAmount: 50 },
    ])
  })

  it('returns nothing when no position has room', () => {
    const positions = [position('x', 100, 60), position('y', 0, 0)]
    expect(getMarginLoanCapacity(positions, 0.5)).toBe(0)
    expect(distributeMarginLoan(10, positions, 0.5)).toEqual([])
    expect(distributeMarginLoan(10, [], 0.5)).toEqual([])
  })

  it('returns nothing for a non-positive or non-finite amount', () => {
    const positions = [position('x', 100, 0)]
    for (const amount of [0, -5, NaN, Infinity]) {
      expect(distributeMarginLoan(amount, positions, 0.5)).toEqual([])
    }
  })

  it('gives a position listed twice no room', () => {
    // Its increments would merge into one row and could pass the cap.
    const positions = [
      position('dup', 100, 0),
      position('dup', 100, 0),
      position('ok', 100, 0),
    ]
    expect(getMarginLoanCapacity(positions, 0.5)).toBe(50)
    const byKey = loanByKey(distributeMarginLoan(50, positions, 0.5))
    expect(byKey['dup-']).toBeUndefined()
    expect(byKey['ok-']).toBeCloseTo(50)
  })

  it('tells answers of one market apart', () => {
    const positions = [position('m', 100, 0, 'a'), position('m', 100, 0, 'b')]
    expect(getMarginLoanCapacity(positions, 0.5)).toBe(100)
  })

  it('skips positions with NaN value or loan', () => {
    const positions = [
      position('nanValue', NaN, 0),
      position('nanLoan', 100, NaN),
      position('ok', 100, 0),
    ]
    expect(getMarginLoanCapacity(positions, 0.5)).toBe(50)
    expect(distributeMarginLoan(20, positions, 0.5)).toEqual([
      { contractId: 'ok', answerId: null, loanAmount: 20 },
    ])
  })
})

describe('getMarginLoanPositions', () => {
  const eligible = {
    token: 'MANA',
    isResolved: false,
    visibility: 'public',
    isRanked: true,
    uniqueBettorCount: 50,
    createdTime: Date.now() - 7 * 24 * 60 * 60 * 1000,
  }
  const binaryAt = (prob: number, extra?: Record<string, unknown>) => ({
    ...eligible,
    mechanism: 'cpmm-1',
    prob,
    ...extra,
  })
  const contracts = {
    binary: binaryAt(0.25),
    set: {
      ...eligible,
      mechanism: 'cpmm-multi-1',
      shouldAnswersSumToOne: false,
      answers: [
        { id: 'open', prob: 0.1 },
        { id: 'resolved', prob: 1, resolution: 'YES', resolutionTime: 1 },
      ],
    },
    multi2: {
      ...eligible,
      mechanism: 'cpmm-multi-2',
      shouldAnswersSumToOne: true,
      answers: [{ id: 'v2', prob: 0.6 }],
    },
    resolved: binaryAt(0.5, { isResolved: true }),
    cash: binaryAt(0.5, { token: 'CASH' }),
    unlisted: binaryAt(0.5, { visibility: 'unlisted' }),
    unranked: binaryAt(0.5, { isRanked: false }),
    fewTraders: binaryAt(0.5, { uniqueBettorCount: 3 }),
    perp: { ...eligible, mechanism: 'perp' },
  } as unknown as Record<string, Contract>

  const metricOn = (
    contractId: string,
    answerId: string | null,
    totalShares: Record<string, number>,
    extra?: Partial<ContractMetric>
  ) =>
    ({
      contractId,
      answerId,
      totalShares,
      // Stale stored payout: positions must be valued at the current prob.
      payout: 12345,
      invested: 0,
      loan: 0,
      marginLoan: 0,
      ...extra,
    } as ContractMetric)

  it('values positions at the current probability and sums both loans', () => {
    const positions = getMarginLoanPositions(
      [
        metricOn('binary', null, { YES: 100 }, { loan: 3, marginLoan: 7 }),
        metricOn('set', 'open', { NO: 200 }),
        metricOn('multi2', 'v2', { YES: 10 }),
      ],
      contracts
    )
    expect(positions.map((p) => [p.contractId, p.answerId, p.loan])).toEqual([
      ['binary', null, 10],
      ['set', 'open', 0],
      ['multi2', 'v2', 0],
    ])
    expect(positions[0].value).toBeCloseTo(100 * 0.25)
    expect(positions[1].value).toBeCloseTo(200 * 0.9)
    expect(positions[2].value).toBeCloseTo(10 * 0.6)
  })

  // Selling all of one side repays the whole loan, so the cap must hold
  // against the smaller side's value, not the payout of both.
  it('values a position holding both sides by its smaller side', () => {
    const [mixed] = getMarginLoanPositions(
      [metricOn('binary', null, { YES: 100, NO: 20 })],
      contracts
    )
    expect(mixed.value).toBeCloseTo(20 * 0.75)
    // A side too small to sell doesn't drag the value down.
    const [dust] = getMarginLoanPositions(
      [metricOn('binary', null, { YES: 100, NO: 1e-12 })],
      contracts
    )
    expect(dust.value).toBeCloseTo(25)
  })

  it('leaves out positions with a negative or non-finite loan', () => {
    const positions = getMarginLoanPositions(
      [
        // Nets to zero, but the SQL floors each column separately.
        metricOn('binary', null, { YES: 100 }, { loan: -100, marginLoan: 100 }),
        metricOn('multi2', 'v2', { YES: 10 }, { marginLoan: -1 }),
        metricOn('set', 'open', { NO: 200 }, { loan: NaN }),
      ],
      contracts
    )
    expect(positions).toEqual([])
  })

  it('keeps positions with no cost basis left', () => {
    const positions = getMarginLoanPositions(
      [metricOn('binary', null, { YES: 100 }, { invested: 0 })],
      contracts
    )
    expect(positions).toHaveLength(1)
  })

  it('leaves out everything a new loan may not go on', () => {
    const positions = getMarginLoanPositions(
      [
        metricOn('set', null, { NO: 200 }), // multi summary row
        metricOn('set', 'resolved', { YES: 50 }),
        metricOn('set', 'missing', { YES: 50 }),
        metricOn('resolved', null, { YES: 50 }),
        metricOn('cash', null, { YES: 50 }),
        metricOn('unlisted', null, { YES: 50 }),
        metricOn('unranked', null, { YES: 50 }),
        metricOn('fewTraders', null, { YES: 50 }),
        metricOn('perp', null, { YES: 50 }),
        metricOn('unknown', null, { YES: 50 }),
      ],
      contracts
    )
    expect(positions).toEqual([])
  })
})

describe('keyContractsWithLiveAnswers', () => {
  const answer = (id: string, contractId: string, prob: number) =>
    ({ id, contractId, prob } as Answer)
  const multi = {
    id: 'multi',
    mechanism: 'cpmm-multi-1',
    answers: [answer('a', 'multi', 0.9), answer('b', 'multi', 0.3)],
  } as unknown as CPMMMultiContract
  const binary = {
    id: 'binary',
    mechanism: 'cpmm-1',
    prob: 0.4,
  } as unknown as Contract

  it('prefers the answers table over the denormalized copy', () => {
    const byId = keyContractsWithLiveAnswers(
      [multi, binary],
      [answer('a', 'multi', 0.1), answer('c', 'multi', 0.2)]
    )
    const answers = (byId.multi as CPMMMultiContract).answers
    // a is live, b keeps the denormalized copy, c was missing from it.
    expect(answers.map((a) => [a.id, a.prob])).toEqual([
      ['a', 0.1],
      ['b', 0.3],
      ['c', 0.2],
    ])
    expect(byId.binary).toBe(binary)
    // The input contract is not mutated.
    expect(multi.answers[0].prob).toBe(0.9)
  })

  it('caps margin loan at the live value when the copy is stale', () => {
    const eligibleMulti = {
      ...multi,
      token: 'MANA',
      isResolved: false,
      visibility: 'public',
      isRanked: true,
      uniqueBettorCount: 50,
      createdTime: Date.now() - 7 * 24 * 60 * 60 * 1000,
    } as unknown as CPMMMultiContract
    const metric = {
      contractId: 'multi',
      answerId: 'a',
      totalShares: { YES: 1000 },
      loan: 0,
      marginLoan: 0,
    } as unknown as ContractMetric
    const stale = getMarginLoanCapacity(
      getMarginLoanPositions([metric], { multi: eligibleMulti }),
      0.5
    )
    const live = getMarginLoanCapacity(
      getMarginLoanPositions(
        [metric],
        keyContractsWithLiveAnswers(
          [eligibleMulti],
          [answer('a', 'multi', 0.1)]
        )
      ),
      0.5
    )
    expect(stale).toBeCloseTo(450)
    expect(live).toBeCloseTo(50)
  })
})
