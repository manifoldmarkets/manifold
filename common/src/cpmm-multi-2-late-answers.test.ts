import { sumBy } from 'lodash'
import { Answer } from './answer'
import { LimitBet } from './bet'
import {
  calculateCpmmMultiArbitrageBet,
  cpmmMultiTradeMissesSumToOne,
} from './calculate-cpmm-arbitrage'
import {
  addAnswerToCpmmMulti2Pools,
  getCpmmProbability,
} from './calculate-cpmm'
import { noFees } from './fees'
import { getNewContract } from './new-contract'

// Each answer added to a cpmm-multi-2 market splits Other in two, so a market
// that gains answers while nobody buys Other ends up with answers far below 1%,
// priced by a sliver of their pool's NO side. Live testing found a Ṁ100 YES
// buy on the 36th such answer leaving the probabilities summing to 164%: the
// buy's own leg moved that answer from 0% to 99% on less than the rounding of
// the other answers' legs. These buys are now solved price-led there.

// A market opened at A 40%, B 30% and Other 30% on Ṁ1,000, then split 50
// times at Ṁ100 an answer, in index order as the backend reads it: listed
// answers, then the newest, then Other.
const splitMarket = (splits: number) => {
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
    answerProbs: [40, 30],
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
    const { pools } = addAnswerToCpmmMulti2Pools(
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

  it('opens the 50th answer priced by a sliver of its pool', () => {
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
