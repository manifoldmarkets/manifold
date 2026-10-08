import { mapValues, sumBy } from 'lodash'
import { Answer } from './answer'
import { LimitBet } from './bet'
import {
  calculateCpmmMultiArbitrageBet,
  calculateCpmmMultiArbitrageSellYes,
  cpmmMultiTradeMissesSumToOne,
  poolsAfterResults,
} from './calculate-cpmm-arbitrage'
import {
  addCpmmMultiLiquidityAnswersSumToOneV2,
  getCpmmProbability,
  pForProbability,
} from './calculate-cpmm'
import { noFees } from './fees'
import { getNewContract } from './new-contract'
import { getCpmmMultiSellSharesInfo } from './sell-bet'

// Until new answers opened at 2% (addAnswerToCpmmMulti2Pools), adding one to
// a cpmm-multi-2 market cut Other's pool in two, each half at half Other's
// price, and spread the fee over the market. A market that gained answers
// while nobody bought Other ended up with answers far below 1%, priced by a
// sliver of their pool's NO side, and dev still has some. Live testing found a
// Ṁ100 YES buy on the 36th such answer leaving the probabilities summing to
// 164%: the buy's own leg moved that answer from 0% to 99% on less than the
// rounding of the other answers' legs. These buys are now solved price-led.
// This is that split, as far as these markets needed it.
type Pools = {
  [answerId: string]: { pool: { YES: number; NO: number }; p: number }
}
const halvingSplit = (
  pools: Pools,
  otherId: string,
  newId: string,
  fee: number
): Pools => {
  const { pool, p } = pools[otherId]
  const half = { YES: pool.YES - pool.NO + pool.NO / 2, NO: pool.NO / 2 }
  const halfP = pForProbability(half, getCpmmProbability(pool, p) / 2)
  // Below, the old split kept p at 0.01 and moved NO into the listed answers.
  if (!(halfP >= 0.01)) throw new Error('Needs the rest of the old split')
  const split = {
    ...pools,
    [otherId]: { pool: half, p: halfP },
    [newId]: { pool: { ...half }, p: halfP },
  }
  return mapValues(
    addCpmmMultiLiquidityAnswersSumToOneV2(split, fee),
    ({ pool, p }) => ({ pool, p })
  )
}

// A market opened at A 40%, B 30% and Other 30% (or the odds given) on
// Ṁ1,000, then split `splits` times that way at Ṁ100 an answer, in index
// order as the backend reads it: listed answers, then the newest, then Other.
const splitMarket = (splits: number, answerProbs = [40, 30]) => {
  const contract = getNewContract({
    id: 'c',
    slug: 'c',
    creator: { id: 'creator', name: 'C', username: 'c', avatarUrl: '' },
    question: 'Q?',
    outcomeType: 'MULTIPLE_CHOICE',
    description: '',
    initialProb: 50,
    ante: 1000,
    closeTime: 0,
    visibility: 'public',
    min: 0,
    max: 0,
    isLogScale: false,
    answers: ['A', 'B'],
    addAnswersMode: 'ANYONE',
    shouldAnswersSumToOne: true,
    answerProbs,
    cpmmMulti2Enabled: true,
    token: 'MANA',
    unit: '',
  } as any) as any
  expect(contract.mechanism).toBe('cpmm-multi-2')
  let answers: Answer[] = contract.answers.map((a: Answer, i: number) => ({
    ...a,
    id: `a${i}`,
    index: i,
  }))
  for (let i = 0; i < splits; i++) {
    const other = answers.find((a) => a.isOther)!
    const pools = halvingSplit(
      Object.fromEntries(
        answers.map((a) => [
          a.id,
          { pool: { YES: a.poolYes, NO: a.poolNo }, p: a.p },
        ])
      ),
      other.id,
      `new${i}`,
      100
    )
    const withPool = (a: Answer): Answer => ({
      ...a,
      poolYes: pools[a.id].pool.YES,
      poolNo: pools[a.id].pool.NO,
      p: pools[a.id].p,
      prob: getCpmmProbability(pools[a.id].pool, pools[a.id].p),
    })
    const n = answers.length
    answers = [
      ...answers.filter((a) => !a.isOther).map(withPool),
      withPool({ ...other, id: `new${i}`, isOther: false, index: n - 1 }),
      { ...withPool(other), index: n },
    ]
  }
  return answers
}

const buy = (
  answers: Answer[],
  answer: Answer,
  outcome: 'YES' | 'NO',
  amount: number,
  orders: LimitBet[] = []
) => {
  const { newBetResult, otherBetResults } = calculateCpmmMultiArbitrageBet(
    answers,
    answer,
    outcome,
    amount,
    undefined,
    orders,
    {},
    noFees
  )
  const legs = [newBetResult, ...otherBetResults]
  return {
    probSum: sumBy(legs, (l) =>
      getCpmmProbability(l.cpmmState.pool, (l.answer as Answer).p)
    ),
    spent: sumBy(legs, (l) => sumBy(l.takers, 'amount')),
    shares: sumBy(newBetResult.takers, 'shares'),
    prob: getCpmmProbability(newBetResult.cpmmState.pool, answer.p),
  }
}

describe('cpmm-multi-2 buys on answers split off a tiny Other', () => {
  const answers = splitMarket(50)
  const last = answers.find((a) => a.id === 'new49')!

  it('leaves the 50th answer priced by a sliver of its pool', () => {
    expect(
      sumBy(answers, (a) =>
        getCpmmProbability({ YES: a.poolYes, NO: a.poolNo }, a.p)
      )
    ).toBeCloseTo(1, 12)
    expect(last.prob).toBeLessThan(1e-15)
    expect(last.poolNo).toBeLessThan(1e-12)
  })

  it('keeps the probabilities summing to one and spends the bet', () => {
    let prob = last.prob
    for (const amount of [1e-6, 0.01, 1, 10, 100, 1000]) {
      const r = buy(answers, last, 'YES', amount)
      expect(Math.abs(r.probSum - 1)).toBeLessThan(1e-9)
      expect(r.spent).toBeLessThanOrEqual(amount * (1 + 1e-12))
      expect(r.spent).toBeGreaterThan(amount - 1e-9 * Math.max(amount, 1))
      // A bigger bet buys the answer higher, and not to the 99% cap: the Ṁ100
      // buy that summed to 164% left it there.
      expect(r.prob).toBeGreaterThan(prob)
      expect(r.prob).toBeLessThan(0.9)
      prob = r.prob
    }
  })

  it("prices the same whether Other comes before or after the newest answer, as in a client's copy", () => {
    const other = answers.find((a) => a.isOther)!
    const clientOrder = [
      ...answers.filter((a) => !a.isOther && a.id !== last.id),
      other,
      last,
    ]
    const backend = buy(answers, last, 'YES', 100)
    const client = buy(clientOrder, last, 'YES', 100)
    expect(client.prob).toBeCloseTo(backend.prob, 9)
    expect(client.shares).toBeCloseTo(backend.shares, 6)
  })

  it('fills a resting order on the answer on the way up', () => {
    const order = {
      id: 'order',
      userId: 'maker',
      contractId: 'c',
      answerId: last.id,
      outcome: 'NO',
      limitProb: 0.1,
      orderAmount: 50,
      amount: 0,
      shares: 0,
      loanAmount: 0,
      isFilled: false,
      isCancelled: false,
      fills: [],
      createdTime: 1,
      probBefore: last.prob,
      probAfter: last.prob,
      fees: noFees,
      isRedemption: false,
    } as LimitBet
    for (const amount of [1, 30, 300]) {
      const r = buy(answers, last, 'YES', amount, [order])
      expect(Math.abs(r.probSum - 1)).toBeLessThan(1e-9)
      expect(r.spent).toBeGreaterThan(amount * (1 - 1e-9))
    }
  })

  it('prices every other answer, both ways, with the probabilities summing to one', () => {
    for (const answer of answers) {
      for (const outcome of ['YES', 'NO'] as const) {
        // Bets are held to 1%-99%: there's no NO to buy below 1%.
        if (outcome === 'NO' && answer.prob < 0.01) continue
        const r = buy(answers, answer, outcome, 50)
        expect(Math.abs(r.probSum - 1)).toBeLessThan(1e-9)
        expect(r.spent).toBeGreaterThan(50 * (1 - 1e-9))
      }
    }
  })
})

// placeBet refuses a single-answer trade the arbitrage couldn't price, by
// what it would leave the probabilities summing to.
describe('cpmm-multi-2 multi-sell beside an answer bought up to 99%', () => {
  // Live testing: A 98% and B 1%, so Other opens at 1%, then 36 answers
  // added. Ṁ100 of YES on the newest, then Ṁ3,000 of YES on Other, which the
  // 99% cap stops at Ṁ642.09, leaving Other's pool all but empty. Selling the
  // newest answer through multi-sell then wrote pools summing to 4.86%:
  // multi-sell's search for the NO shares that bring the sum back to one can't
  // land on Other. multi-sell and multi-bet now refuse a v2 trade like this.
  // (The sale of Other's NO from its near-empty side also returned a cost
  // short of the root until the general-p solve finished Newton; with that
  // the pools sum to 1.01, still a miss.)
  // The arbitrage's own legs carry each answer's pool in cpmmState.
  type Leg = {
    answer: { id: string }
    cpmmState: { pool: { [outcome: string]: number } }
  }
  const poolsAfterTrade = (
    answerId: string,
    own: Pick<Leg, 'cpmmState'>,
    others: Leg[]
  ) =>
    poolsAfterResults([
      {
        newBet: { answerId },
        newPool: own.cpmmState.pool,
        otherBetResults: others,
      },
    ])
  const holding = () => {
    let answers = splitMarket(36, [98, 1])
    const newest = answers[answers.length - 2]
    const other = answers[answers.length - 1]
    const buy = (id: string, amount: number) => {
      const answer = answers.find((a) => a.id === id)!
      const { newBetResult, otherBetResults } = calculateCpmmMultiArbitrageBet(
        answers,
        answer,
        'YES',
        amount,
        undefined,
        [],
        {},
        noFees
      )
      const pools = poolsAfterTrade(id, newBetResult, otherBetResults)
      answers = answers.map((a) => ({
        ...a,
        poolYes: pools[a.id].YES,
        poolNo: pools[a.id].NO,
        prob: getCpmmProbability(pools[a.id], a.p),
      }))
      return sumBy(newBetResult.takers, 'shares')
    }
    const shares = buy(newest.id, 100)
    buy(other.id, 3000)
    return { answers, newest, shares }
  }
  const multiSell = (answers: Answer[], answerId: string, shares: number) =>
    getCpmmMultiSellSharesInfo(
      {
        id: 'c',
        mechanism: 'cpmm-multi-2',
        shouldAnswersSumToOne: true,
        answers,
        collectedFees: noFees,
      } as any,
      { [answerId]: [{ answerId, outcome: 'YES', shares } as any] },
      [],
      {},
      {}
    )
  const sumAfter = (
    answers: Answer[],
    pools: ReturnType<typeof poolsAfterResults>
  ) =>
    sumBy(answers, (a) =>
      getCpmmProbability(pools[a.id] ?? { YES: a.poolYes, NO: a.poolNo }, a.p)
    )

  it('refuses the sale that broke the sum, and sells it on its own exactly', () => {
    const { answers, newest, shares } = holding()
    expect(Math.abs(sumAfter(answers, {}) - 1)).toBeLessThan(1e-12)

    const pools = poolsAfterResults(multiSell(answers, newest.id, shares))
    expect(Object.keys(pools)).toHaveLength(answers.length)
    expect(Math.abs(sumAfter(answers, pools) - 1)).toBeGreaterThan(1e-3)
    expect(cpmmMultiTradeMissesSumToOne(answers, pools)).toBe(true)

    const { newBetResult, otherBetResults } =
      calculateCpmmMultiArbitrageSellYes(
        answers,
        newest,
        shares,
        undefined,
        [],
        {},
        noFees
      )
    const salePools = poolsAfterTrade(newest.id, newBetResult, otherBetResults)
    expect(Math.abs(sumAfter(answers, salePools) - 1)).toBeLessThan(1e-9)
    expect(cpmmMultiTradeMissesSumToOne(answers, salePools)).toBe(false)
  })

  it('passes a multi-sell that keeps the sum', () => {
    // The same position, before Other is bought up.
    let answers = splitMarket(36, [98, 1])
    const newest = answers[answers.length - 2]
    const { newBetResult, otherBetResults } = calculateCpmmMultiArbitrageBet(
      answers,
      newest,
      'YES',
      100,
      undefined,
      [],
      {},
      noFees
    )
    const bought = poolsAfterTrade(newest.id, newBetResult, otherBetResults)
    answers = answers.map((a) => ({
      ...a,
      poolYes: bought[a.id].YES,
      poolNo: bought[a.id].NO,
      prob: getCpmmProbability(bought[a.id], a.p),
    }))
    const shares = sumBy(newBetResult.takers, 'shares')
    const pools = poolsAfterResults(multiSell(answers, newest.id, shares))
    expect(Math.abs(sumAfter(answers, pools) - 1)).toBeLessThan(1e-6)
    expect(cpmmMultiTradeMissesSumToOne(answers, pools)).toBe(false)
  })
})

describe('poolsAfterResults', () => {
  const pool = (n: number) => ({ YES: n, NO: n })
  it('keeps the pool each answer is written with last', () => {
    expect(
      poolsAfterResults([
        {
          newBet: { answerId: 'a' },
          newPool: pool(1),
          otherBetResults: [
            { answer: { id: 'b' }, cpmmState: { pool: pool(2) } },
            { answer: { id: 'c' }, cpmmState: { pool: pool(3) } },
          ],
        },
        { newBet: { answerId: 'b' }, newPool: pool(4) },
      ])
    ).toEqual({ a: pool(1), b: pool(4), c: pool(3) })
  })
})

describe('cpmmMultiTradeMissesSumToOne', () => {
  // Two answers at p = 0.5, so each one's probability is N / (Y + N).
  const answer = (id: string, poolYes: number, poolNo: number) =>
    ({ id, poolYes, poolNo, p: 0.5 } as Answer)
  const at = (prob: number) => ({ YES: 1 - prob, NO: prob })
  const healthy = [answer('a', 0.6, 0.4), answer('b', 0.4, 0.6)]

  it('passes a trade that keeps them summing to one', () => {
    expect(
      cpmmMultiTradeMissesSumToOne(healthy, { a: at(0.7), b: at(0.3) })
    ).toBe(false)
    expect(
      cpmmMultiTradeMissesSumToOne(healthy, { a: at(0.7), b: at(0.3 + 1e-7) })
    ).toBe(false)
  })

  it('refuses one that leaves them off', () => {
    expect(
      cpmmMultiTradeMissesSumToOne(healthy, { a: at(0.99), b: at(0.6) })
    ).toBe(true)
    expect(
      cpmmMultiTradeMissesSumToOne(healthy, { a: at(0.7), b: at(0.3 + 1e-5) })
    ).toBe(true)
  })

  it("counts the answers a trade didn't touch at their own pools", () => {
    expect(cpmmMultiTradeMissesSumToOne(healthy, { a: at(0.4) })).toBe(false)
    expect(cpmmMultiTradeMissesSumToOne(healthy, { a: at(0.9) })).toBe(true)
  })

  it('leaves resolved answers out', () => {
    // An answer resolved NO early, its pool left at 5%: the open answers sum
    // to one without it.
    const withResolved = [
      ...healthy,
      { ...answer('c', 0.95, 0.05), resolution: 'NO' } as Answer,
    ]
    expect(
      cpmmMultiTradeMissesSumToOne(withResolved, {
        a: at(0.7 + 1e-12),
        b: at(0.3),
      })
    ).toBe(false)
    expect(
      cpmmMultiTradeMissesSumToOne(withResolved, { a: at(0.99), b: at(0.6) })
    ).toBe(true)
  })

  it('lets a market already off trade, as long as it gets no further off', () => {
    // Summing to 1.64, like the market live testing left.
    const broken = [answer('a', 0.01, 0.99), answer('b', 0.35, 0.65)]
    expect(cpmmMultiTradeMissesSumToOne(broken, {})).toBe(false)
    expect(
      cpmmMultiTradeMissesSumToOne(broken, { a: at(0.4), b: at(0.6) })
    ).toBe(false)
    expect(
      cpmmMultiTradeMissesSumToOne(broken, { a: at(0.99), b: at(0.7) })
    ).toBe(true)
  })
})
