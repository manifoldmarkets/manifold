import { sumBy } from 'lodash'
import { Answer, answerP } from './answer'
import { getAnswerProbability } from './calculate'
import { computeElasticity } from './calculate-metrics'
import { MultiContract } from './contract'
import { noFees } from './fees'
import { getNewMultiCpmmBetInfo } from './new-bet'
import { getSaleResultMultiSumsToOne } from './sell-bet'

// Regression: answers deserialized from the denormalized contract data blob
// (data->'answers' — SSR/SEO/embeds, search "lite" answers) bypass convertAnswer's
// `row.p ?? 0.5` default, so any answer written before cpmm-multi-2 added `p` reads
// p === undefined at runtime despite Answer typing it as non-optional. A bare
// `answer.p` then poisons getCpmmProbability with NaN. answerP is the choke-point
// default; getAnswerProbability (and the client bet-preview paths) must use it.

const blobAnswer = (overrides: Partial<Answer> = {}): Answer =>
  // Cast through unknown: we are deliberately building the type-violating shape
  // (p missing) that real pre-p blob answers have at runtime.
  ({
    id: 'a1',
    index: 0,
    contractId: 'c1',
    userId: 'u1',
    text: 'answer one',
    createdTime: 0,
    poolYes: 100,
    poolNo: 300,
    prob: 0.75,
    totalLiquidity: 100,
    subsidyPool: 0,
    probChanges: { day: 0, week: 0, month: 0 },
    ...overrides,
  } as unknown as Answer)

describe('answerP', () => {
  it('defaults a missing p to 0.5', () => {
    expect(answerP(blobAnswer())).toBe(0.5)
  })

  it('passes through a stored p', () => {
    expect(answerP(blobAnswer({ p: 0.3 }))).toBe(0.3)
  })
})

describe('getAnswerProbability on a blob-sourced (p-less) answer', () => {
  const withAnswers = (...answers: Answer[]) =>
    ({ mechanism: 'cpmm-multi-1', answers } as MultiContract)

  it('returns the p=0.5 pool probability, not NaN', () => {
    const prob = getAnswerProbability(withAnswers(blobAnswer()), 'a1')
    expect(Number.isFinite(prob)).toBe(true)
    // p = 0.5: prob = NO / (YES + NO) = 300 / 400
    expect(prob).toBeCloseTo(0.75, 12)
  })

  it('still honors per-answer resolution fields', () => {
    expect(
      getAnswerProbability(withAnswers(blobAnswer({ resolution: 'NO' })), 'a1')
    ).toBe(0)
    expect(
      getAnswerProbability(withAnswers(blobAnswer({ resolution: 'YES' })), 'a1')
    ).toBe(1)
  })
})

// The same p-less answers reach the pricing code: the scheduler computes a
// market's elasticity from the contract row's cached answers, and the site
// previews bets and sales on whatever answers it loaded. cpmm-multi-1 priced
// those at a hard-coded p = 0.5, so with p missing they must come out exactly
// as they do with p = 0.5, not as NaN.
describe('pricing a cpmm-multi-1 market whose answers have no p', () => {
  const probs = [0.5, 0.3, 0.2]
  const makeAnswers = (withP: boolean, k: number) =>
    probs.map((q, i) => {
      const poolYes = Math.sqrt((k * (1 - q)) / q)
      return blobAnswer({
        id: `a${i}`,
        index: i,
        poolYes,
        poolNo: k / poolYes,
        prob: q,
        ...(withP ? { p: 0.5 } : {}),
      })
    })
  // k is each answer's pool product. Elasticity bets Ṁ10,000, which pushes a
  // shallow pool to 0% or 100% whatever its p, so it needs deep pools to show.
  const makeContract = (withP: boolean, k = 100) =>
    ({
      id: 'c1',
      mechanism: 'cpmm-multi-1',
      outcomeType: 'MULTIPLE_CHOICE',
      shouldAnswersSumToOne: true,
      addAnswersMode: 'DISABLED',
      isResolved: false,
      collectedFees: noFees,
      answers: makeAnswers(withP, k),
    } as unknown as MultiContract)

  const blob = makeContract(false)
  const fresh = makeContract(true)

  it('computes elasticity as with p = 0.5', () => {
    const e = computeElasticity([], makeContract(false, 1e9))
    expect(Number.isFinite(e)).toBe(true)
    expect(Object.is(e, computeElasticity([], makeContract(true, 1e9)))).toBe(
      true
    )
  })

  it('previews a bet as with p = 0.5', () => {
    const preview = (c: MultiContract) => {
      const r = getNewMultiCpmmBetInfo(
        c,
        c.answers,
        c.answers[1],
        'YES',
        50,
        undefined,
        [],
        {}
      )
      if (!('otherBetResults' in r)) throw new Error('expected a linked bet')
      return [
        [r.newBet.shares, r.newBet.probAfter, r.newPool.YES, r.newPool.NO],
        ...r.otherBetResults.map((o) => [
          sumBy(o.takers, 'shares'),
          o.bet.probAfter,
          o.cpmmState.pool.YES,
          o.cpmmState.pool.NO,
        ]),
      ]
    }
    const got = preview(blob)
    expect(got.flat().every(Number.isFinite)).toBe(true)
    expect(got).toEqual(preview(fresh))
  })

  it('previews a sale as with p = 0.5', () => {
    const sale = (c: MultiContract) => {
      const { saleValue, cpmmState } = getSaleResultMultiSumsToOne(
        c,
        'a0',
        20,
        'YES',
        [],
        {}
      )
      return [saleValue, cpmmState.pool.YES, cpmmState.pool.NO]
    }
    const got = sale(blob)
    expect(got.every(Number.isFinite)).toBe(true)
    expect(got).toEqual(sale(fresh))
  })
})
