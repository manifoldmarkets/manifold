import {
  roundAnswerProbs,
  withAnswerProbRemoved,
  withAnswerProbSet,
} from './answer-probs'
import { Answer } from './answer'
import { getInitialAnswerProbability } from './calculate'
import {
  getBalancedAnswerPools,
  getInitialAnswerPools,
  getLosslessAnswerPools,
  MIN_SEED_DEPTH,
} from './calculate-cpmm'
import { calculateCpmmMultiArbitrageBet } from './calculate-cpmm-arbitrage'
import { CPMMMultiContract } from './contract'
import { noFees } from './fees'
import {
  ANSWER_PROB_SUM_TOLERANCE,
  getAnswerProbsError,
  getNewContract,
  MAX_ANSWER_PROB,
  MIN_ANSWER_PROB,
} from './new-contract'
import { User } from './user'

const probOf = (pool: { YES: number; NO: number }) =>
  pool.NO / (pool.YES + pool.NO)

// What the liquidity providers are paid if answer k is the one that resolves
// YES: their YES shares in k, plus their NO shares in every other answer.
const payoutIfAnswerWins = (pools: { YES: number; NO: number }[], k: number) =>
  pools[k].YES +
  pools.reduce((total, pool, i) => total + (i === k ? 0 : pool.NO), 0)

describe('getInitialAnswerPools', () => {
  it('matches the even-split formula when every answer starts equal', () => {
    const ante = 1000
    for (const n of [2, 3, 4, 10, 25]) {
      const pools = getInitialAnswerPools(Array(n).fill(1 / n), ante, true)
      for (const pool of pools) {
        expect(pool.YES).toBeCloseTo(ante / 2, 4)
        expect(pool.NO).toBeCloseTo(ante / (2 * n - 2), 4)
      }
    }
  })

  it('starts answers at the probabilities they were given', () => {
    const cases = [
      [0.6, 0.3, 0.1],
      [0.9, 0.05, 0.05],
      [0.8, 0.2],
      [0.5, 0.25, 0.15, 0.1],
      [0.02, 0.98],
    ]
    for (const probs of cases) {
      const pools = getInitialAnswerPools(probs, 1000, true)
      pools.forEach((pool, i) => expect(probOf(pool)).toBeCloseTo(probs[i], 6))
    }
  })

  it('never pays out more than the ante that seeded it', () => {
    const cases = [
      [0.6, 0.3, 0.1],
      [0.9, 0.05, 0.05],
      [0.8, 0.2],
      [0.34, 0.33, 0.33],
      [0.5, 0.25, 0.15, 0.1],
      Array(20).fill(0.05),
    ]
    const ante = 1000
    for (const probs of cases) {
      const pools = getInitialAnswerPools(probs, ante, true)
      pools.forEach((_, k) =>
        expect(payoutIfAnswerWins(pools, k)).toBeLessThanOrEqual(ante + 1e-6)
      )
    }
  })

  it('spends the whole ante on the answer that needs it most', () => {
    // Some answer has to pay out the full ante, otherwise we left liquidity on
    // the table.
    const ante = 1000
    const pools = getInitialAnswerPools([0.6, 0.3, 0.1], ante, true)
    const payouts = pools.map((_, k) => payoutIfAnswerWins(pools, k))
    expect(Math.max(...payouts)).toBeCloseTo(ante, 4)
  })

  it('gives independent answers their own share of the ante', () => {
    const pools = getInitialAnswerPools([0.75, 0.5, 0.2], 300, false)
    pools.forEach((pool) => {
      // Each answer is its own binary market, so neither side can pay out more
      // than the 100 mana that seeded it.
      expect(Math.max(pool.YES, pool.NO)).toBeCloseTo(100, 6)
    })
    expect(probOf(pools[0])).toBeCloseTo(0.75, 6)
    expect(probOf(pools[1])).toBeCloseTo(0.5, 6)
    expect(probOf(pools[2])).toBeCloseTo(0.2, 6)
  })

  it.each([
    { probs: [0.4, 0.3, 0.2, 0.1] },
    { probs: [0.3, 0.3, 0.3, 0.1] },
    { probs: [0.35, 0.35, 0.3] },
    { probs: [0.2, 0.2, 0.2, 0.2, 0.1, 0.05, 0.05] },
  ])('keeps the whole ante at $probs', ({ probs }) => {
    const ante = 1000
    const pools = getInitialAnswerPools(probs, ante, true)
    pools.forEach((pool, i) => expect(probOf(pool)).toBeCloseTo(probs[i], 9))
    pools.forEach((_, k) =>
      expect(payoutIfAnswerWins(pools, k)).toBeCloseTo(ante, 6)
    )
  })

  it('keeps every answer at least half as deep as the balanced split', () => {
    // The lossless split alone would leave the 17% answers a few mana deep.
    for (const probs of [
      [0.49, 0.17, 0.17, 0.17],
      [0.499, 0.25, 0.251],
      [0.45, 0.45, 0.1],
      [0.45, 0.11, 0.11, 0.11, 0.11, 0.11],
    ]) {
      const pools = getInitialAnswerPools(probs, 1000, true)
      const balanced = getBalancedAnswerPools(probs, 1000)
      pools.forEach((pool, i) =>
        expect(pool.YES).toBeGreaterThanOrEqual(
          MIN_SEED_DEPTH * balanced[i].YES - 1e-9
        )
      )
    }
  })

  it('reduces the lossless split to the even-split formula', () => {
    for (const n of [3, 4, 10]) {
      const pools = getLosslessAnswerPools(Array(n).fill(1 / n), 1000)
      for (const pool of pools) {
        expect(pool.YES).toBeCloseTo(500, 6)
        expect(pool.NO).toBeCloseTo(1000 / (2 * n - 2), 6)
      }
    }
  })

  it('holds its guarantees for any starting probabilities', () => {
    // Deterministic pseudo-random probability vectors, including ones with an
    // answer at or above 50%, where nothing can be lossless.
    let seed = 1
    const random = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    const ante = 1000
    for (let trial = 0; trial < 500; trial++) {
      const n = 2 + Math.floor(random() * 15)
      const weights = Array.from({ length: n }, () => 0.02 + random() ** 3)
      const total = weights.reduce((a, b) => a + b, 0)
      const probs = weights.map((w) => w / total)

      const pools = getInitialAnswerPools(probs, ante, true)
      const payouts = pools.map((_, k) => payoutIfAnswerWins(pools, k))
      pools.forEach((pool, i) => {
        expect(pool.YES).toBeGreaterThan(0)
        expect(pool.NO).toBeGreaterThan(0)
        expect(probOf(pool)).toBeCloseTo(probs[i], 9)
      })
      // Backed by exactly the ante: never more, and the full ante somewhere.
      payouts.forEach((payout) =>
        expect(payout).toBeLessThanOrEqual(ante + 1e-6)
      )
      expect(Math.max(...payouts)).toBeCloseTo(ante, 4)
      // Never worth less, at the starting odds, than the balanced split.
      const value = payouts.reduce((v, payout, k) => v + probs[k] * payout, 0)
      const balanced = getBalancedAnswerPools(probs, ante)
      const balancedValue = balanced.reduce(
        (v, _, k) => v + probs[k] * payoutIfAnswerWins(balanced, k),
        0
      )
      expect(value).toBeGreaterThanOrEqual(balancedValue - 1e-6)
    }
  })

  it('trades normally from the pools it seeds', () => {
    const probs = [0.49, 0.2, 0.2, 0.11]
    const pools = getInitialAnswerPools(probs, 1000, true)
    const answers = pools.map(
      (pool, i) =>
        ({
          id: `answer${i}`,
          contractId: 'contract',
          poolYes: pool.YES,
          poolNo: pool.NO,
          prob: probOf(pool),
        } as Answer)
    )
    for (const answer of answers) {
      for (const outcome of ['YES', 'NO'] as const) {
        const { newBetResult, otherBetResults } =
          calculateCpmmMultiArbitrageBet(
            answers,
            answer,
            outcome,
            50,
            undefined,
            [],
            {},
            noFees
          )
        const newProbs = [newBetResult, ...otherBetResults].map((result) =>
          probOf(result.cpmmState.pool as { YES: number; NO: number })
        )
        expect(newProbs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6)
        const moved = newProbs[0] - answer.prob
        expect(outcome === 'YES' ? moved : -moved).toBeGreaterThan(0)
      }
    }
  })
})

describe('getAnswerProbsError', () => {
  const sumToOne = {
    numAnswers: 3,
    shouldAnswersSumToOne: true,
    hasOtherAnswer: false,
  }

  it('accepts probabilities that add up to 100', () => {
    expect(
      getAnswerProbsError({ ...sumToOne, answerProbs: [50, 30, 20] })
    ).toBeUndefined()
  })

  it('tolerates rounding, but not a real mistake', () => {
    expect(
      getAnswerProbsError({
        ...sumToOne,
        answerProbs: [33, 33, 33 + ANSWER_PROB_SUM_TOLERANCE],
      })
    ).toBeUndefined()
    expect(
      getAnswerProbsError({ ...sumToOne, answerProbs: [50, 30, 30] })
    ).toContain('110')
  })

  it.each([{ answerProbs: [50, 49.5, 1] }, { answerProbs: [99, 1, 1] }])(
    'rejects $answerProbs when normalization crosses the lower bound',
    ({ answerProbs }) => {
      expect(getAnswerProbsError({ ...sumToOne, answerProbs })).toContain(
        'After normalization'
      )
    }
  )

  it.each([
    { answerProbs: [33, 33, 33] },
    { answerProbs: [34, 34, 33] },
    { answerProbs: [99, 1] },
    { answerProbs: [1, 15.1, 48.2, 35.7] },
  ])(
    'accepts $answerProbs when normalized probabilities stay in bounds',
    ({ answerProbs }) => {
      expect(
        getAnswerProbsError({
          ...sumToOne,
          numAnswers: answerProbs.length,
          answerProbs,
        })
      ).toBeUndefined()
    }
  )

  it('rejects a count that does not match the answers', () => {
    expect(
      getAnswerProbsError({ ...sumToOne, answerProbs: [50, 50] })
    ).toContain('got 2')
  })

  it('rejects probabilities outside the tradeable range', () => {
    expect(
      getAnswerProbsError({
        ...sumToOne,
        answerProbs: [MIN_ANSWER_PROB - 0.5, 50, 50],
      })
    ).toContain(`${MIN_ANSWER_PROB}%`)
    expect(
      getAnswerProbsError({
        ...sumToOne,
        numAnswers: 2,
        answerProbs: [MAX_ANSWER_PROB + 0.5, 0.5],
      })
    ).toContain(`${MAX_ANSWER_PROB}%`)
  })

  it('keeps the Other answer inside the same bounds', () => {
    const withOther = { ...sumToOne, hasOtherAnswer: true }
    expect(
      getAnswerProbsError({ ...withOther, answerProbs: [50, 20, 10] })
    ).toBeUndefined()
    // Nothing left for Other
    expect(
      getAnswerProbsError({ ...withOther, answerProbs: [50, 30, 20] })
    ).toContain('Other')
    // Everything left for Other, which would open it at 100%
    expect(
      getAnswerProbsError({ ...withOther, numAnswers: 0, answerProbs: [] })
    ).toContain('Other')
  })

  it.each([{ answerProbs: [99] }, { answerProbs: [1] }])(
    'accepts $answerProbs with Other taking the bounded remainder',
    ({ answerProbs }) => {
      expect(
        getAnswerProbsError({
          ...sumToOne,
          numAnswers: answerProbs.length,
          hasOtherAnswer: true,
          answerProbs,
        })
      ).toBeUndefined()
    }
  )

  it('does not constrain the sum for independent answers', () => {
    expect(
      getAnswerProbsError({
        ...sumToOne,
        shouldAnswersSumToOne: false,
        answerProbs: [80, 70, 60],
      })
    ).toBeUndefined()
  })

  it('does not normalize independent probabilities at the bounds', () => {
    expect(
      getAnswerProbsError({
        ...sumToOne,
        shouldAnswersSumToOne: false,
        answerProbs: [99, 1, 1],
      })
    ).toBeUndefined()
  })
})

describe('getNewContract with answerProbs', () => {
  const creator = {
    id: 'creator',
    name: 'Creator',
    username: 'creator',
    createdTime: 0,
  } as User

  const makeMultiContract = (props: {
    answers: string[]
    answerProbs?: number[]
    addAnswersMode?: 'DISABLED' | 'ONLY_CREATOR' | 'ANYONE'
    ante?: number
  }) =>
    getNewContract({
      id: 'contract',
      slug: 'contract',
      creator,
      question: 'Who wins?',
      outcomeType: 'MULTIPLE_CHOICE',
      description: '',
      initialProb: 50,
      ante: props.ante ?? 1000,
      closeTime: undefined,
      visibility: 'public',
      isTwitchContract: undefined,
      token: 'MANA',
      min: 0,
      max: 0,
      isLogScale: false,
      answers: props.answers,
      answerProbs: props.answerProbs,
      addAnswersMode: props.addAnswersMode ?? 'DISABLED',
      shouldAnswersSumToOne: true,
      unit: undefined,
      midpoints: undefined,
      timezone: undefined,
      voterVisibility: undefined,
      pollType: undefined,
      maxSelections: undefined,
    } as any) as CPMMMultiContract

  it('still splits evenly when no probabilities are given', () => {
    const { answers } = makeMultiContract({ answers: ['A', 'B', 'C', 'D'] })
    expect(answers.map((a) => a.prob)).toEqual([0.25, 0.25, 0.25, 0.25])
  })

  it('starts each answer where the creator set it', () => {
    const { answers } = makeMultiContract({
      answers: ['A', 'B', 'C'],
      answerProbs: [60, 30, 10],
    })
    expect(answers.map((a) => a.prob)).toEqual([0.6, 0.3, 0.1])
    answers.forEach((answer) =>
      expect(answer.poolNo / (answer.poolYes + answer.poolNo)).toBeCloseTo(
        answer.prob,
        6
      )
    )
  })

  it('gives the Other answer whatever is left over', () => {
    const { answers } = makeMultiContract({
      answers: ['A', 'B'],
      answerProbs: [60, 30],
      addAnswersMode: 'ANYONE',
    })
    expect(answers.map((a) => a.text)).toEqual(['A', 'B', 'Other'])
    expect(answers.map((a) => a.prob)).toEqual([0.6, 0.3, 0.1])
    expect(answers[2].isOther).toBe(true)
  })

  it('normalises percentages that are a rounding point off', () => {
    const { answers } = makeMultiContract({
      answers: ['A', 'B', 'C'],
      answerProbs: [33, 33, 33],
    })
    expect(answers.reduce((total, a) => total + a.prob, 0)).toBeCloseTo(1, 10)
  })

  it('remembers where each answer opened, so history starts there', () => {
    const contract = makeMultiContract({
      answers: ['A', 'B'],
      answerProbs: [60, 30],
      addAnswersMode: 'ANYONE',
    })
    const [a, b, other] = contract.answers
    expect(contract.initialProbabilities).toEqual({
      [a.id]: 0.6,
      [b.id]: 0.3,
      [other.id]: 0.1,
    })
    // Even after trading moves the live probability, history starts where
    // the creator put it — not at the even split the fallback assumes.
    const traded = {
      ...contract,
      answers: contract.answers.map((ans) => ({ ...ans, prob: 1 / 3 })),
    }
    expect(getInitialAnswerProbability(traded, traded.answers[0])).toBe(0.6)
    expect(getInitialAnswerProbability(traded, traded.answers[2])).toBe(0.1)
  })

  it('leaves the even split unrecorded, so old markets are unaffected', () => {
    const contract = makeMultiContract({ answers: ['A', 'B', 'C', 'D'] })
    expect(contract.initialProbabilities).toBeUndefined()
    expect(getInitialAnswerProbability(contract, contract.answers[0])).toBe(
      0.25
    )
  })
})

describe('editing starting probabilities in the create form', () => {
  it('rounds to a tenth without changing the total', () => {
    const rounded = roundAnswerProbs([100 / 3, 100 / 3, 100 / 3, 0])
    expect(rounded).toEqual([33.4, 33.3, 33.3, 0])
    expect(rounded.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10)
  })

  it('gives a newly named answer an even slice taken from the others', () => {
    // Two named answers at 50/50 and a blank slot that just got named.
    const probs = withAnswerProbSet([50, 50, 0], 2, 100 / 3)
    expect(probs).toEqual([33.4, 33.3, 33.3])
  })

  it('hands a blanked answer’s share back to the rest, in proportion', () => {
    expect(withAnswerProbSet([40, 40, 20], 2, 0)).toEqual([50, 50, 0])
    expect(withAnswerProbSet([60, 20, 20], 2, 0)).toEqual([75, 25, 0])
  })

  it('leaves a valid split alone when a blank slot is deleted', () => {
    // A blank slot holds 0, so removing it changes nothing for the others.
    expect(withAnswerProbRemoved([50, 50, 0], 2)).toEqual([50, 50])
  })

  it('spreads a deleted answer’s share over the rest in proportion', () => {
    expect(withAnswerProbRemoved([60, 30, 10], 2)).toEqual([66.7, 33.3])
  })

  it('keeps whatever total the named answers had, so Other is untouched', () => {
    // 80% across the named answers, 20% left for Other.
    const probs = withAnswerProbSet([40, 40, 0], 2, 80 / 3)
    expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(80, 10)
  })
})
