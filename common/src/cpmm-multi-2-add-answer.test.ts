import { sumBy } from 'lodash'
import { Answer } from './answer'
import {
  addAnswerToCpmmMulti2Pools,
  addCpmmMultiLiquidityAnswersSumToOneV2,
  getCpmmProbability,
  isDrainedPool,
  pForProbability,
} from './calculate-cpmm'
import { calculateCpmmMultiArbitrageBet } from './calculate-cpmm-arbitrage'
import { CPMMMulti } from './contract'
import { noFees } from './fees'
import { getNewContract } from './new-contract'

type Pools = {
  [answerId: string]: { pool: { YES: number; NO: number }; p: number }
}

const openAddable = (answerProbs: number[], ante = 1000) => {
  const contract = getNewContract({
    id: 'c',
    slug: 'c',
    creator: { id: 'creator', name: 'C', username: 'c', avatarUrl: '' },
    question: 'Q?',
    outcomeType: 'MULTIPLE_CHOICE',
    description: '',
    initialProb: 50,
    ante,
    closeTime: 0,
    visibility: 'public',
    min: 0,
    max: 0,
    isLogScale: false,
    answers: answerProbs.map((_, i) => `A${i}`),
    addAnswersMode: 'ANYONE',
    shouldAnswersSumToOne: true,
    answerProbs,
    cpmmMulti2Enabled: true,
    token: 'MANA',
    unit: '',
  } as any) as CPMMMulti
  expect(contract.mechanism).toBe('cpmm-multi-2')
  return contract.answers.map((a, i) => ({
    ...a,
    id: a.isOther ? 'other' : `a${i}`,
  }))
}

const toPools = (answers: Answer[]): Pools =>
  Object.fromEntries(
    answers.map((a) => [
      a.id,
      { pool: { YES: a.poolYes, NO: a.poolNo }, p: a.p },
    ])
  )

const trade = (
  answers: Answer[],
  i: number,
  outcome: 'YES' | 'NO',
  amount: number
) => {
  const { newBetResult, otherBetResults } = calculateCpmmMultiArbitrageBet(
    answers,
    answers[i],
    outcome,
    amount,
    undefined,
    [],
    {},
    noFees
  )
  const poolById = new Map(
    [newBetResult, ...otherBetResults].map((r) => [
      r.answer.id,
      r.cpmmState.pool,
    ])
  )
  return answers.map((a) => {
    const pool = poolById.get(a.id)
    return pool
      ? {
          ...a,
          poolYes: pool.YES,
          poolNo: pool.NO,
          prob: getCpmmProbability(pool, a.p),
        }
      : a
  })
}

const prob = ({ pool, p }: Pools[string]) => getCpmmProbability(pool, p)

// What the pools pay their providers if `winner` resolves YES: its YES shares
// and every other answer's NO.
const poolPayout = (pools: Pools, winner: string) =>
  sumBy(Object.entries(pools), ([id, { pool }]) =>
    id === winner ? pool.YES : pool.NO
  )

// The pools pay what they did whichever answer wins, plus the part of the fee
// they took (`fee`), to within rounding of the shares they hold.
const expectSplitKeepsPayouts = (before: Pools, after: Pools, fee: number) => {
  const shares = sumBy(Object.values(before), ({ pool }) => pool.YES + pool.NO)
  const expectPays = (winner: string, was: number) =>
    expect(Math.abs(poolPayout(after, winner) - (was + fee))).toBeLessThan(
      1e-12 * (shares + fee)
    )
  for (const id of Object.keys(before)) {
    const was = poolPayout(before, id)
    if (id === 'other') {
      // Whichever half of Other wins, the pools pay what Other winning did.
      expectPays('new', was)
      expectPays('other', was)
    } else expectPays(id, was)
  }
}

// How far a billionth of a mana on either side moves an answer. An answer
// priced by a sliver of one side moves a long way on it.
const hairTrigger = ({ pool, p }: Pools[string]) => {
  const lnOdds =
    Math.log(p) + Math.log(pool.NO) - Math.log1p(-p) - Math.log(pool.YES)
  const probAt = (x: number) => 1 / (1 + Math.exp(-x))
  const nudge = 1e-9
  return Math.max(
    probAt(lnOdds + Math.log1p(nudge / pool.NO) / p) - probAt(lnOdds),
    probAt(lnOdds) - probAt(lnOdds - Math.log1p(nudge / pool.YES) / (1 - p))
  )
}

const expectSane = (pools: Pools) => {
  expect(sumBy(Object.values(pools), prob)).toBeCloseTo(1, 10)
  for (const answer of Object.values(pools)) {
    expect(isDrainedPool(answer.pool)).toBe(false)
    expect(answer.p).toBeGreaterThanOrEqual(0.01 - 1e-12)
    expect(answer.p).toBeLessThanOrEqual(0.99 + 1e-12)
    expect(hairTrigger(answer)).toBeLessThan(1e-3)
  }
}

// An answer at probability q priced at p, with `yes` YES in its pool.
const poolAt = (q: number, p: number, yes: number) => {
  const pool = { YES: yes, NO: (yes * (q / (1 - q))) / (p / (1 - p)) }
  return { pool, p: pForProbability(pool, q) }
}

const expectPricesHeld = (before: Pools, after: Pools) => {
  for (const id of Object.keys(before)) {
    if (id === 'other') continue
    expect(prob(after[id]) / prob(before[id])).toBeCloseTo(1, 10)
  }
  expect(prob(after.new)).toBeCloseTo(prob(before.other) / 2, 12)
  expect(prob(after.other)).toBeCloseTo(prob(before.other) / 2, 12)
  expect(sumBy(Object.values(after), prob)).toBeCloseTo(1, 10)
  for (const { pool, p } of Object.values(after)) {
    expect(isDrainedPool(pool)).toBe(false)
    expect(p).toBeGreaterThan(0)
    expect(p).toBeLessThan(1)
  }
}

describe('addAnswerToCpmmMulti2Pools', () => {
  it('pays providers what Other did, whichever answer wins', () => {
    let answers = openAddable([50, 30])
    answers = trade(answers, 0, 'YES', 200)
    answers = trade(answers, 2, 'YES', 40)
    const before = toPools(answers)
    const after = addAnswerToCpmmMulti2Pools(before, 'other', 'new', 0).pools
    expectSplitKeepsPayouts(before, after, 0)
    expectPricesHeld(before, after)
    // With Other not a heavy favourite, only Other's pool is split.
    for (const id of ['a0', 'a1']) expect(after[id]).toEqual(before[id])
  })

  it("adds the answer's fee as liquidity every outcome pays back", () => {
    let answers = openAddable([40, 25, 20])
    answers = trade(answers, 1, 'NO', 150)
    const before = toPools(answers)
    const after = addAnswerToCpmmMulti2Pools(before, 'other', 'new', 75).pools
    expectSplitKeepsPayouts(before, after, 75)
    expectPricesHeld(before, after)
  })

  it('moves the NO a heavy-favourite Other cannot split into the listed pools', () => {
    let answers = openAddable([10, 5])
    answers = trade(answers, 2, 'YES', 3000)
    const before = toPools(answers)
    expect(prob(before.other)).toBeGreaterThan(0.9)
    expect(before.other.pool.NO).toBeGreaterThan(before.other.pool.YES)
    const after = addAnswerToCpmmMulti2Pools(before, 'other', 'new', 20).pools
    for (const id of ['a0', 'a1'])
      expect(after[id].pool.YES).toBeGreaterThan(before[id].pool.YES)
    expectSplitKeepsPayouts(before, after, 20)
    expectPricesHeld(before, after)
  })

  it('splits an Other near 0% into tradeable answers', () => {
    let answers = openAddable([60, 39])
    for (let k = 0; k < 6; k++) answers = trade(answers, 0, 'YES', 5000)
    const before = toPools(answers)
    expect(prob(before.other)).toBeLessThan(1e-4)
    const after = addAnswerToCpmmMulti2Pools(before, 'other', 'new', 10).pools
    expectSplitKeepsPayouts(before, after, 10)
    expectPricesHeld(before, after)

    const split: Answer[] = [
      ...answers.filter((a) => !a.isOther),
      { ...answers.find((a) => a.isOther)!, id: 'new', isOther: false },
      answers.find((a) => a.isOther)!,
    ].map((a) => {
      const { pool, p } = after[a.id]
      return {
        ...a,
        poolYes: pool.YES,
        poolNo: pool.NO,
        p,
        prob: getCpmmProbability(pool, p),
      }
    })
    for (const amount of [1, 100, 10_000]) {
      const traded = trade(split, 2, 'YES', amount)
      for (const a of traded)
        expect(isDrainedPool({ YES: a.poolYes, NO: a.poolNo })).toBe(false)
      expect(traded[2].prob).toBeGreaterThan(split[2].prob)
    }
  })

  it('keeps the payouts through many answers added in a row', () => {
    let pools = toPools(openAddable([35, 35, 20]))
    const start = toPools(openAddable([35, 35, 20]))
    let fees = 0
    for (let k = 0; k < 10; k++) {
      const next = addAnswerToCpmmMulti2Pools(pools, 'other', `n${k}`, 10).pools
      fees += 10
      for (const id of ['a0', 'a1', 'a2'])
        expect(poolPayout(next, id)).toBeCloseTo(
          poolPayout(start, id) + fees,
          6
        )
      // Every answer split out of Other pays what Other winning originally did.
      for (const id of [
        ...Array.from({ length: k + 1 }, (_, j) => `n${j}`),
        'other',
      ])
        expect(poolPayout(next, id)).toBeCloseTo(
          poolPayout(start, 'other') + fees,
          6
        )
      expect(sumBy(Object.values(next), prob)).toBeCloseTo(1, 10)
      pools = next
    }
  })

  it('keeps the halves at p = 0.01 or above when Other sits near its p at 1.5%', () => {
    const before: Pools = {
      a0: poolAt(0.985, 0.985, 100),
      other: poolAt(0.015, 0.0166, 100),
    }
    // Split down the middle, each half would price at p = 0.009.
    const { pools: after, pendingSubsidy } = addAnswerToCpmmMulti2Pools(
      before,
      'other',
      'new',
      25
    )
    expect(pendingSubsidy).toBe(0)
    expect(after.new.p).toBeGreaterThanOrEqual(0.01 - 1e-12)
    expectSplitKeepsPayouts(before, after, 25)
    expectPricesHeld(before, after)
    expectSane(after)
  })

  it("holds a listed answer's price at p = 0.99 when adding YES alone would pass it", () => {
    // A former favourite, now at 30%, priced at p = 0.99 with a thin NO side,
    // next to an Other at 70% holding far more NO than YES.
    const before: Pools = {
      a0: poolAt(0.3, 0.99, 231),
      other: poolAt(0.7, 0.0446, 20),
    }
    const { pools: after, pendingSubsidy } = addAnswerToCpmmMulti2Pools(
      before,
      'other',
      'new',
      25
    )
    expectSplitKeepsPayouts(before, after, 25 - pendingSubsidy)
    expectPricesHeld(before, after)
    expectSane(after)
  })

  it('makes the halves smaller rather than move a listed price when the fee is too small', () => {
    const before: Pools = {
      a0: poolAt(0.3, 0.99, 231),
      other: poolAt(0.7, 0.0446, 20),
    }
    // Too small a fee to pay for the liquidity that holds a0's price.
    const full = addAnswerToCpmmMulti2Pools(before, 'other', 'new', 25).pools
    const { pools: after, pendingSubsidy } = addAnswerToCpmmMulti2Pools(
      before,
      'other',
      'new',
      1
    )
    expectSplitKeepsPayouts(before, after, 1 - pendingSubsidy)
    expectPricesHeld(before, after)
    expectSane(after)
    expect(after.new.pool.NO).toBeLessThan(full.new.pool.NO)
    expect(after.new.pool.NO).toBeGreaterThan(full.new.pool.NO / 10)
  })

  it('shrinks a listed answer above 99% in proportion, holding its price and p', () => {
    const before: Pools = {
      a0: poolAt(0.995, 0.99, 100),
      other: poolAt(0.005, 0.011, 100),
    }
    const { pools: after, pendingSubsidy } = addAnswerToCpmmMulti2Pools(
      before,
      'other',
      'new',
      25
    )
    expect(after.a0.p).toBe(before.a0.p)
    // Every answer is outside 1%-99%, so the fee waits.
    expect(pendingSubsidy).toBeGreaterThan(25)
    expectSplitKeepsPayouts(before, after, 25 - pendingSubsidy)
    expectPricesHeld(before, after)
    expectSane(after)
  })

  it('never lifts the p of a listed answer above 99%', () => {
    // Too thin to shrink by what the full halves would ask of it.
    const before: Pools = {
      a0: poolAt(0.995, 0.99, 5),
      other: poolAt(0.005, 0.011, 100),
    }
    const { pools: after, pendingSubsidy } = addAnswerToCpmmMulti2Pools(
      before,
      'other',
      'new',
      25
    )
    expect(after.a0.p).toBeLessThanOrEqual(before.a0.p)
    expectSplitKeepsPayouts(before, after, 25 - pendingSubsidy)
    expectPricesHeld(before, after)
    expectSane(after)
  })

  it('keeps payouts, prices and p in band over arbitrary markets', () => {
    let seed = 7
    const rand = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    const logUniform = (lo: number, hi: number) =>
      Math.exp(Math.log(lo) + rand() * (Math.log(hi) - Math.log(lo)))
    let checked = 0
    for (let trial = 0; trial < 3000; trial++) {
      const n = 1 + Math.floor(rand() * 6)
      // Probabilities from a spread of shapes, down to 1e-9.
      const weights = Array.from({ length: n + 1 }, () =>
        rand() < 0.3 ? logUniform(1e-9, 1e-2) : rand()
      )
      const total = sumBy(weights)
      const before: Pools = {}
      weights.forEach((w, i) => {
        const p = 0.01 + 0.98 * rand()
        before[i === n ? 'other' : `a${i}`] = poolAt(
          w / total,
          p,
          logUniform(0.1, 10_000)
        )
      })
      // Only states trades can reach: no answer starts as a hair trigger.
      if (Object.values(before).some((a) => !(hairTrigger(a) < 1e-4))) continue
      const fee = rand() < 0.2 ? 0 : logUniform(1, 1000)
      const result = addAnswerToCpmmMulti2Pools(before, 'other', 'new', fee)
      expectSplitKeepsPayouts(before, result.pools, fee - result.pendingSubsidy)
      expectSane(result.pools)
      expectPricesHeld(before, result.pools)
      checked++
    }
    expect(checked).toBeGreaterThan(1500)
  })
})

describe('addCpmmMultiLiquidityAnswersSumToOneV2', () => {
  it('leaves an answer outside 1%-99% as it is', () => {
    const before: Pools = {
      a0: poolAt(0.6, 0.6, 500),
      a1: poolAt(0.4 - 1e-7, 0.4, 500),
      // Opened a favourite, since ground down to 1e-7.
      a2: poolAt(1e-7, 0.98, 800),
    }
    const after = addCpmmMultiLiquidityAnswersSumToOneV2(before, 100)
    expect(after.a2.pool).toEqual(before.a2.pool)
    expect(after.a2.p).toBe(before.a2.p)
    for (const id of ['a0', 'a1'])
      expect(prob(after[id]) / prob(before[id])).toBeCloseTo(1, 12)
    for (const id of Object.keys(before))
      expect(poolPayout(after, id)).toBeCloseTo(poolPayout(before, id) + 100, 6)
    expectSane(after)
  })
})
