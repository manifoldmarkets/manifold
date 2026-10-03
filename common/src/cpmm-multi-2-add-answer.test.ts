import { sumBy } from 'lodash'
import { Answer } from './answer'
import {
  addAnswerToCpmmMulti2Pools,
  addCpmmMultiLiquidityAnswersSumToOneV2,
  getCpmmLiquidity,
  getCpmmProbability,
  isDrainedPool,
  NEW_ANSWER_PROB,
  pForProbability,
} from './calculate-cpmm'
import { calculateCpmmMultiArbitrageBet } from './calculate-cpmm-arbitrage'
import { CPMMMulti, MAX_CPMM_PROB, MIN_CPMM_PROB } from './contract'
import { noFees } from './fees'
import { getNewContract } from './new-contract'
import { getAnswerCostFromLiquidity } from './tier'

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

// The pools pay what they did whichever answer wins, plus the fee, to within
// rounding of the shares they hold.
const expectSplitKeepsPayouts = (
  before: Pools,
  after: Pools,
  fee: number,
  newId = 'new'
) => {
  const shares = sumBy(Object.values(before), ({ pool }) => pool.YES + pool.NO)
  const expectPays = (winner: string, was: number) =>
    expect(Math.abs(poolPayout(after, winner) - (was + fee))).toBeLessThan(
      1e-12 * (shares + fee)
    )
  for (const id of Object.keys(before)) {
    const was = poolPayout(before, id)
    if (id === 'other') {
      // Whichever part of Other wins, the pools pay what Other winning did.
      expectPays(newId, was)
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

// The pools after adding an answer, `new` unless named.
const split = (before: Pools, fee: number, newId = 'new') => {
  const after = addAnswerToCpmmMulti2Pools(before, 'other', newId, fee)
  if (!after) throw new Error('No room for the new answer')
  return after
}

// The answers after a split, in the order the backend reads them: the listed
// answers, then the new one, then Other.
const withSplit = (answers: Answer[], pools: Pools, newId = 'new') => {
  const withPool = (a: Answer): Answer => {
    const { pool, p } = pools[a.id]
    return {
      ...a,
      poolYes: pool.YES,
      poolNo: pool.NO,
      p,
      prob: getCpmmProbability(pool, p),
    }
  }
  const other = answers.find((a) => a.isOther)!
  return [
    ...answers.filter((a) => !a.isOther).map(withPool),
    withPool({ ...other, id: newId, isOther: false }),
    withPool(other),
  ]
}

// The new answer opens at 2% out of Other, and the listed answers keep their
// prices.
const expectOpensFromOther = (before: Pools, after: Pools) => {
  for (const id of Object.keys(before)) {
    if (id === 'other') continue
    expect(prob(after[id]) / prob(before[id])).toBeCloseTo(1, 10)
  }
  expect(prob(after.new)).toBeCloseTo(NEW_ANSWER_PROB, 12)
  expect(prob(after.other)).toBeCloseTo(
    prob(before.other) - NEW_ANSWER_PROB,
    12
  )
  expect(sumBy(Object.values(after), prob)).toBeCloseTo(1, 12)
}

// The new answer opens at 2%, Other gives what it can down to 1%, and the
// listed answers give the rest, each the same share of its price.
const expectListedGiveTheRest = (before: Pools, after: Pools) => {
  const was = prob(before.other)
  const other = was < 0.01 ? was : Math.max(0.01, was - NEW_ANSWER_PROB)
  expect(prob(after.new)).toBeCloseTo(NEW_ANSWER_PROB, 12)
  expect(prob(after.other)).toBeCloseTo(other, 12)
  const share = (1 - NEW_ANSWER_PROB - other) / (1 - was)
  for (const id of Object.keys(before)) {
    if (id === 'other') continue
    expect(prob(after[id]) / prob(before[id])).toBeCloseTo(share, 9)
  }
  expect(sumBy(Object.values(after), prob)).toBeCloseTo(1, 12)
}

// Mana a YES buy needs to take answer `id` to `target`.
const costTo = (answers: Answer[], id: string, target: number) => {
  const i = answers.findIndex((a) => a.id === id)
  const probAfter = (amount: number) => {
    const { newBetResult } = calculateCpmmMultiArbitrageBet(
      answers,
      answers[i],
      'YES',
      amount,
      undefined,
      [],
      {},
      noFees
    )
    return getCpmmProbability(newBetResult.cpmmState.pool, answers[i].p)
  }
  let [lo, hi] = [0, 1]
  while (probAfter(hi) < target) hi *= 2
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2
    if (probAfter(mid) < target) lo = mid
    else hi = mid
  }
  return hi
}

describe('addAnswerToCpmmMulti2Pools', () => {
  it('opens the new answer at 2% out of Other, keeping the listed prices', () => {
    let answers = openAddable([50, 30])
    answers = trade(answers, 0, 'YES', 200)
    answers = trade(answers, 2, 'YES', 40)
    const before = toPools(answers)
    const after = split(before, 0)
    expectSplitKeepsPayouts(before, after, 0)
    expectOpensFromOther(before, after)
    expectSane(after)
    // With Other not a heavy favourite, only Other's pool is split.
    for (const id of ['a0', 'a1']) expect(after[id]).toEqual(before[id])
  })

  it("puts the fee into the new answer's pool, which every outcome pays back", () => {
    let answers = openAddable([40, 25, 20])
    answers = trade(answers, 1, 'NO', 150)
    const before = toPools(answers)
    const after = split(before, 75)
    expectSplitKeepsPayouts(before, after, 75)
    expectOpensFromOther(before, after)
    expectSane(after)
    expect(after.new.pool.NO).toBe(75)
  })

  it('gives the new answer about the depth of one listed at 2% from the start', () => {
    const listed = [30, 20, 10, 5]
    const answers = openAddable(listed)
    const fee = getAnswerCostFromLiquidity(1000, answers.length)
    const added = withSplit(answers, split(toPools(answers), fee))
    const opened = openAddable([...listed, 2], 1000 + fee)
    expect(prob(toPools(opened).a4)).toBeCloseTo(NEW_ANSWER_PROB, 9)
    for (const target of [0.2, 0.5]) {
      const ratio = costTo(added, 'new', target) / costTo(opened, 'a4', target)
      expect(ratio).toBeGreaterThan(0.5)
      expect(ratio).toBeLessThan(2)
    }
  })

  it('moves the NO a heavy-favourite Other cannot split into the listed pools', () => {
    let answers = openAddable([10, 5])
    answers = trade(answers, 2, 'YES', 3000)
    const before = toPools(answers)
    expect(prob(before.other)).toBeGreaterThan(0.9)
    expect(before.other.pool.NO).toBeGreaterThan(before.other.pool.YES)
    const after = split(before, 20)
    for (const id of ['a0', 'a1'])
      expect(after[id].pool.YES).toBeGreaterThan(before[id].pool.YES)
    expectSplitKeepsPayouts(before, after, 20)
    expectOpensFromOther(before, after)
    expectSane(after)
  })

  it('takes Other down to 1%, and the rest from the listed answers in proportion', () => {
    // Other opens at 2%: it gives 1 point and the listed answers 1 between them.
    const before = toPools(openAddable([60, 38]))
    expect(prob(before.other)).toBeCloseTo(0.02, 9)
    const after = split(before, 25)
    expectSplitKeepsPayouts(before, after, 25)
    expectListedGiveTheRest(before, after)
    expectSane(after)
    expect(prob(after.other)).toBeCloseTo(0.01, 12)
  })

  it('leaves an Other below 1% where it is, the listed answers giving the 2%', () => {
    let answers = openAddable([60, 39])
    answers = trade(answers, 0, 'YES', 300)
    const before = toPools(answers)
    expect(prob(before.other)).toBeLessThan(0.01)
    const after = split(before, 25)
    expectSplitKeepsPayouts(before, after, 25)
    expectListedGiveTheRest(before, after)
    expectSane(after)
  })

  it('splits an Other near 0% into tradeable answers', () => {
    let answers = openAddable([60, 39])
    for (let k = 0; k < 6; k++) answers = trade(answers, 0, 'YES', 5000)
    const before = toPools(answers)
    expect(prob(before.other)).toBeLessThan(1e-4)
    const after = split(before, 10)
    expectSplitKeepsPayouts(before, after, 10)
    expectListedGiveTheRest(before, after)
    expectSane(after)

    const answersAfter = withSplit(answers, after)
    for (const i of [2, 3])
      for (const amount of [1, 100, 10_000]) {
        const traded = trade(answersAfter, i, 'YES', amount)
        for (const a of traded)
          expect(isDrainedPool({ YES: a.poolYes, NO: a.poolNo })).toBe(false)
        expect(traded[i].prob).toBeGreaterThan(answersAfter[i].prob)
      }
  })

  it('keeps a clear favourite able to give its share, add after add', () => {
    // The right answer gets added, bought up to 98%, and more answers keep
    // coming, each bought back down and the favourite back up. Each add takes
    // its 2% from the favourite, lowering its p, until YES in every pool makes
    // it room.
    let answers = openAddable([50, 30])
    answers = withSplit(answers, split(toPools(answers), 100, 'right'), 'right')
    answers = trade(answers, 2, 'YES', 5000)
    expect(answers[2].prob).toBeGreaterThan(0.97)
    for (let k = 0; k < 40; k++) {
      const before = toPools(answers)
      const after = split(before, 100, `n${k}`)
      expectSplitKeepsPayouts(before, after, 100, `n${k}`)
      expectSane(after)
      expect(prob(after[`n${k}`])).toBeCloseTo(NEW_ANSWER_PROB, 12)
      for (const id of Object.keys(before))
        if (id !== 'other')
          expect(prob(after[id])).toBeLessThanOrEqual(prob(before[id]))
      answers = withSplit(answers, after, `n${k}`)
      answers = trade(answers, answers.length - 2, 'NO', 50)
      answers = trade(answers, 2, 'YES', 500)
    }
  })

  it('keeps the payouts through many answers added in a row', () => {
    let pools = toPools(openAddable([35, 35, 20]))
    const start = toPools(openAddable([35, 35, 20]))
    let fees = 0
    for (let k = 0; k < 10; k++) {
      const next = addAnswerToCpmmMulti2Pools(pools, 'other', `n${k}`, 10)!
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
      expect(sumBy(Object.values(next), prob)).toBeCloseTo(1, 12)
      pools = next
    }
  })

  it('opens every answer at 2% with a pool of its own, 60 adds from a 60% Other', () => {
    let answers = openAddable([25, 15])
    for (let k = 0; k < 60; k++) {
      const fee = getAnswerCostFromLiquidity(1000 + 25 * k, answers.length)
      const before = toPools(answers)
      const after = addAnswerToCpmmMulti2Pools(before, 'other', `n${k}`, fee)!
      expectSane(after)
      expect(prob(after[`n${k}`])).toBeCloseTo(NEW_ANSWER_PROB, 12)
      expect(after[`n${k}`].pool.NO).toBeGreaterThan(fee / 4)
      answers = withSplit(answers, after, `n${k}`)
    }
    // 29 adds take Other from 60% to 2%, and it stays at 1% after.
    expect(answers[answers.length - 1].prob).toBeCloseTo(0.01, 12)
  })

  it('keeps the new answer and the new Other in band when Other sits near its p at 1.5%', () => {
    const before: Pools = {
      a0: poolAt(0.985, 0.985, 100),
      other: poolAt(0.015, 0.0166, 100),
    }
    const after = split(before, 25)
    expectSplitKeepsPayouts(before, after, 25)
    expectListedGiveTheRest(before, after)
    expectSane(after)
  })

  it("holds a listed answer's price at p = 0.99 when adding YES alone would pass it", () => {
    // A former favourite, now at 30%, priced at p = 0.99 with a thin NO side,
    // next to an Other at 70% holding far more NO than YES.
    const before: Pools = {
      a0: poolAt(0.3, 0.99, 231),
      other: poolAt(0.7, 0.0446, 20),
    }
    const after = split(before, 25)
    expectSplitKeepsPayouts(before, after, 25)
    expectOpensFromOther(before, after)
    expectSane(after)
  })

  it('lets a listed price give a little when the fee is too small to hold it', () => {
    const before: Pools = {
      a0: poolAt(0.3, 0.99, 231),
      other: poolAt(0.7, 0.0446, 20),
    }
    const after = split(before, 1)
    expectSplitKeepsPayouts(before, after, 1)
    expectSane(after)
    expect(prob(after.a0)).toBeLessThan(prob(before.a0))
    expect(prob(after.a0)).toBeGreaterThan(prob(before.a0) * 0.99)
    expect(prob(after.new)).toBeCloseTo(NEW_ANSWER_PROB, 12)
  })

  it('keeps a listed answer above 99% in band, giving its share', () => {
    for (const yes of [100, 5]) {
      const before: Pools = {
        a0: poolAt(0.995, 0.99, yes),
        other: poolAt(0.005, 0.011, 100),
      }
      const after = split(before, 25)
      expectSplitKeepsPayouts(before, after, 25)
      expectListedGiveTheRest(before, after)
      expectSane(after)
    }
  })

  it("refuses an answer it can't make room for", () => {
    // A favourite at 1 - 1e-8, priced by a sea of NO no fee could move: no
    // trade can take an answer past 99%.
    const before: Pools = {
      a0: poolAt(1 - 1e-8, 0.44, 1.2),
      other: poolAt(1e-8, 0.5, 40),
    }
    expect(addAnswerToCpmmMulti2Pools(before, 'other', 'new', 300)).toBe(
      undefined
    )
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
      // Only states trades can reach: none past 99%, none a hair trigger.
      if (weights.some((w) => w / total > 0.99)) continue
      const before: Pools = {}
      weights.forEach((w, i) => {
        const p = 0.01 + 0.98 * rand()
        before[i === n ? 'other' : `a${i}`] = poolAt(
          w / total,
          p,
          logUniform(0.1, 10_000)
        )
      })
      if (Object.values(before).some((a) => !(hairTrigger(a) < 1e-4))) continue
      // The fee as the market's liquidity sets it, or none.
      const liquidity = sumBy(Object.values(before), ({ pool, p }) =>
        getCpmmLiquidity(pool, p)
      )
      const fee =
        rand() < 0.2 ? 0 : getAnswerCostFromLiquidity(liquidity, n + 1)
      const after = split(before, fee)
      expectSplitKeepsPayouts(before, after, fee)
      expectSane(after)
      // No listed price rises, and the new answer opens at 2% unless its p or
      // the new Other's is held at the edge of [0.01, 0.99].
      for (const id of Object.keys(before))
        if (id !== 'other')
          expect(prob(after[id])).toBeLessThanOrEqual(
            prob(before[id]) * (1 + 1e-12)
          )
      const inBand = (p: number) =>
        p > MIN_CPMM_PROB * (1 + 1e-9) && p < MAX_CPMM_PROB * (1 - 1e-9)
      if (inBand(after.new.p) && inBand(after.other.p))
        expect(prob(after.new)).toBeCloseTo(NEW_ANSWER_PROB, 12)
      // With room in Other and nothing to fold into the listed answers, only
      // Other's pool is split.
      if (
        prob(before.other) >= 0.03 + 1e-9 &&
        before.other.pool.YES >= before.other.pool.NO &&
        after.other.p > MIN_CPMM_PROB &&
        after.other.p < MAX_CPMM_PROB
      )
        for (const id of Object.keys(before))
          if (id !== 'other') expect(after[id]).toEqual(before[id])
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
