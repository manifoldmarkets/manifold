// Cancelling (N/A) one answer of an independent multiple choice market.
//
// The refund of liquidity provided to the whole market used to be
// amount / number of answers for every cancelled answer, whatever that answer
// had received of it. Listing answers after a subsidy had drizzled into the
// older ones and cancelling them paid the subsidy out a second time.
//
// The market below mirrors what the backend does to an independent market
// (generateAntes, createAnswerCpmmMain, addContractLiquidity, drizzleMarket,
// drizzleAnswer, resolveMarketHelper, undoResolution) with the production pool
// and payout functions, and keeps its own ledger of the mana each answer and
// the market's pending subsidy pool hold. No resolution may pay out more than
// that ledger says the answer has.
//
// Unresolving one answer is part of it (backend/api/src/unresolve.ts). It
// used to put a resolved market's whole pool back whichever answer was
// unresolved, though the last answer to resolve had paid it out, and to put
// nothing back while the market was open. It now puts back the share that
// answer's own resolution took. The real handler is tested against PostgreSQL
// in backend/shared/src/unresolve-market-subsidy.test.ts; here both rules are
// mirrored so the random lifecycles cover them.
import { sum, sumBy } from 'lodash'
import { Answer } from './answer'
import {
  addCpmmLiquidity,
  addCpmmLiquidityFixedP,
  addCpmmMultiLiquidityToAnswersIndependently,
  addCpmmMultiLiquidityToAnswersIndependentlyV2,
  calculateCpmmPurchase,
  canDeployCpmmMulti2Liquidity,
  getCpmmProbability,
  getPoolAtProb,
  isDeepenableProb,
} from './calculate-cpmm'
import { CPMMMultiContract } from './contract'
import { ContractMetric } from './contract-metric'
import { noFees } from './fees'
import { LiquidityProvision } from './liquidity-provision'
import { getPayouts, PayoutInfo } from './payouts'
import {
  getFixedCancelPayouts,
  getIndependentMultiAnswerBacking,
} from './payouts-fixed'

type Mechanism = 'cpmm-multi-1' | 'cpmm-multi-2'
type Outcome = 'YES' | 'NO' | 'MKT' | 'CANCEL'
type Position = { YES: number; NO: number; invested: number; sold: number }

// The refund as it was before the fix: every whole-market provision at
// amount / number of answers.
const legacyCancelPayouts = (
  answer: Answer,
  contract: CPMMMultiContract,
  metrics: ContractMetric[],
  liquidities: LiquidityProvision[]
): PayoutInfo =>
  getFixedCancelPayouts(
    metrics.filter((m) => m.answerId === answer.id),
    liquidities
      .filter((l) => l.answerId === answer.id)
      .concat(
        liquidities
          .filter((l) => !l.answerId)
          .map((l) => ({ ...l, amount: l.amount / contract.answers.length }))
      )
  )

type Resolved = {
  payouts: { userId: string; payout: number }[]
  answerSubsidyPool: number
  held: number
  // What the resolution took of the market's pending subsidy: as the market
  // counted it, and by the ledger.
  poolShare: number
  marketShare: number
}

// What recordContractEdit keeps of the market as a resolution found it, under
// that resolution's key (the answer and its resolutionTime).
type Edit = {
  answerId: string
  resolutionTime: number
  subsidyPool: number
  openAnswerIds: string[]
}

class IndependentMarket {
  answers: Answer[] = []
  subsidyPool = 0
  liquidities: LiquidityProvision[] = []
  positions = new Map<string, Position>()
  // Net mana each user has taken out of the market (negative: put in).
  balances: Record<string, number> = {}
  // Mana each answer holds, counted as it moves, not from pools or shares.
  held: Record<string, number> = {}
  // Mana the market's pending subsidy pool holds, counted the same way. It
  // equals subsidyPool unless an unresolve restored more than its resolution
  // took.
  marketHeld = 0
  edits: Edit[] = []
  // Whether the answer is sure to hold at least amount / number of answers of
  // every whole-market provision so far: it was open for each of them, and no
  // answer has been listed or reopened since the first. An answer that joins
  // takes a share of the subsidy still pending, which leaves the others short
  // of amount / number of answers whenever a third had already resolved with
  // its own share.
  holdsFullShares: Record<string, boolean> = {}
  // Cancellations of such answers that had whole-market liquidity to refund.
  fullShareRefunds = 0
  resolved: Record<string, Resolved> = {}
  // Total a resolution paid out beyond what its answer held.
  overpaid = 0
  // Total by which cancellations of such answers refunded less than before.
  shortChanged = 0
  clock = 1
  // The refund and the unresolve as they were before the fixes.
  useLegacyCancel = false
  useLegacyUnresolve = false

  constructor(
    readonly mechanism: Mechanism,
    creator: string,
    answerCount: number,
    ante: number
  ) {
    // generateAntes: each answer's pool is seeded with an even share of the
    // ante, recorded as that answer's own provision.
    for (let i = 0; i < answerCount; i++)
      this.insertAnswer(creator, ante / answerCount)
  }

  get contract() {
    return {
      id: 'c',
      mechanism: this.mechanism,
      shouldAnswersSumToOne: false,
      answers: this.answers,
      subsidyPool: this.subsidyPool,
    } as unknown as CPMMMultiContract
  }

  private insertAnswer(userId: string, amount: number) {
    const id = `a${this.answers.length}`
    this.answers.push({
      id,
      index: this.answers.length,
      contractId: 'c',
      userId,
      text: id,
      createdTime: this.clock++,
      poolYes: amount,
      poolNo: amount,
      p: 0.5,
      prob: 0.5,
      totalLiquidity: amount,
      subsidyPool: 0,
      volume: 0,
      probChanges: { day: 0, week: 0, month: 0 },
    })
    this.liquidities.push({
      id: `l${this.liquidities.length}`,
      userId,
      contractId: 'c',
      createdTime: this.clock++,
      isAnte: true,
      answerId: id,
      amount,
    })
    this.pay(userId, -amount)
    this.held[id] = amount
    this.holdsFullShares[id] = true
    if (this.hasWholeMarketLiquidity()) this.noFullShares()
    return id
  }

  private hasWholeMarketLiquidity() {
    return this.liquidities.some((l) => !l.answerId && l.amount > 0)
  }

  private noFullShares() {
    for (const a of this.answers) this.holdsFullShares[a.id] = false
  }

  private pay(userId: string, amount: number) {
    this.balances[userId] = (this.balances[userId] ?? 0) + amount
  }

  private answer(id: string) {
    return this.answers.find((a) => a.id === id)!
  }

  open() {
    return this.answers.filter((a) => !a.resolution)
  }

  // createAnswerCpmmMain, independent branch.
  addAnswer(userId: string, cost: number) {
    return this.insertAnswer(userId, cost)
  }

  // addContractLiquidity for the whole market: the market's subsidy pool, and
  // a provision with no answer.
  addLiquidity(userId: string, amount: number) {
    this.pay(userId, -amount)
    this.subsidyPool += amount
    this.marketHeld += amount
    this.liquidities.push({
      id: `l${this.liquidities.length}`,
      userId,
      contractId: 'c',
      createdTime: this.clock++,
      amount,
    })
    // An answer resolved now takes none of it, even if it's reopened later.
    for (const a of this.answers)
      if (a.resolution) this.holdsFullShares[a.id] = false
  }

  // addContractLiquidity for one answer (cpmm-multi-2 only).
  addAnswerLiquidity(userId: string, answerId: string, amount: number) {
    const answer = this.answer(answerId)
    this.pay(userId, -amount)
    answer.subsidyPool += amount
    this.held[answerId] += amount
    this.liquidities.push({
      id: `l${this.liquidities.length}`,
      userId,
      contractId: 'c',
      createdTime: this.clock++,
      answerId,
      amount,
    })
  }

  // drizzleMarket, then drizzleAnswer for each answer's own pending subsidy.
  drizzle(fraction: number) {
    const answers = this.open()
    const amount = fraction * this.subsidyPool
    if (answers.length > 0 && amount > 0) {
      if (this.mechanism === 'cpmm-multi-2') {
        const pools = Object.fromEntries(
          answers.map((a) => [
            a.id,
            { pool: { YES: a.poolYes, NO: a.poolNo }, p: a.p },
          ])
        )
        if (canDeployCpmmMulti2Liquidity(pools)) {
          const added = addCpmmMultiLiquidityToAnswersIndependentlyV2(
            pools,
            amount
          )
          for (const a of answers) {
            const { pool, p, pendingSubsidy } = added[a.id]
            a.poolYes = pool.YES
            a.poolNo = pool.NO
            a.p = p
            a.prob = getCpmmProbability(pool, p)
            a.subsidyPool += pendingSubsidy
          }
          this.subsidyPool -= amount
          this.moveFromMarket(fraction, answers)
        }
      } else {
        const added = addCpmmMultiLiquidityToAnswersIndependently(
          Object.fromEntries(
            answers.map((a) => [a.id, { YES: a.poolYes, NO: a.poolNo }])
          ),
          amount
        )
        for (const a of answers) {
          a.poolYes = added[a.id].YES
          a.poolNo = added[a.id].NO
          a.prob = getCpmmProbability(added[a.id], 0.5)
        }
        this.subsidyPool -= amount
        this.moveFromMarket(fraction, answers)
      }
    }
    for (const a of this.open()) {
      if (a.subsidyPool < 1e-7) continue
      const pool = { YES: a.poolYes, NO: a.poolNo }
      const isV2 = this.mechanism === 'cpmm-multi-2'
      if (isV2 && !isDeepenableProb(getCpmmProbability(pool, a.p))) continue
      const own = fraction * a.subsidyPool
      const { newPool, newP } = isV2
        ? addCpmmLiquidity(pool, a.p, own)
        : { ...addCpmmLiquidityFixedP(pool, own), newP: 0.5 }
      a.poolYes = newPool.YES
      a.poolNo = newPool.NO
      a.p = newP
      a.prob = getCpmmProbability(newPool, newP)
      a.subsidyPool -= own
    }
  }

  // The ledger's side of a drizzle: that fraction of what the market's pool
  // really holds, to the answers in equal shares.
  private moveFromMarket(fraction: number, answers: Answer[]) {
    const moved = fraction * this.marketHeld
    for (const a of answers) this.held[a.id] += moved / answers.length
    this.marketHeld -= moved
  }

  private position(userId: string, answerId: string) {
    const key = `${userId}|${answerId}`
    if (!this.positions.has(key))
      this.positions.set(key, { YES: 0, NO: 0, invested: 0, sold: 0 })
    return this.positions.get(key)!
  }

  // A market buy. Shares of both sides are redeemed for mana at once, as the
  // backend does, which is also how a sale works: buy the other side, redeem.
  buy(userId: string, answerId: string, outcome: 'YES' | 'NO', amount: number) {
    const answer = this.answer(answerId)
    const { shares, newPool, newP } = calculateCpmmPurchase(
      {
        pool: { YES: answer.poolYes, NO: answer.poolNo },
        p: answer.p,
        collectedFees: noFees,
      },
      amount,
      outcome,
      true
    )
    if (
      ![shares, newPool.YES, newPool.NO, newP].every(Number.isFinite) ||
      newPool.YES <= 0 ||
      newPool.NO <= 0
    )
      return
    answer.poolYes = newPool.YES
    answer.poolNo = newPool.NO
    answer.p = newP
    answer.prob = getCpmmProbability(newPool, newP)
    const position = this.position(userId, answerId)
    position[outcome] += shares
    position.invested += amount
    this.pay(userId, -amount)
    this.held[answerId] += amount
    const redeemed = Math.min(position.YES, position.NO)
    if (redeemed > 0) {
      position.YES -= redeemed
      position.NO -= redeemed
      position.sold += redeemed
      this.pay(userId, redeemed)
      this.held[answerId] -= redeemed
    }
  }

  metrics(): ContractMetric[] {
    return [...this.positions].map(([key, position]) => {
      const [userId, answerId] = key.split('|')
      return {
        userId,
        answerId,
        totalShares: { YES: position.YES, NO: position.NO },
        totalAmountInvested: position.invested,
        totalAmountSold: position.sold,
      } as unknown as ContractMetric
    })
  }

  payoutsFor(
    answerId: string,
    outcome: Outcome,
    legacyCancel: boolean,
    // For MKT.
    probability?: number
  ) {
    const answer = this.answer(answerId)
    return outcome === 'CANCEL' && legacyCancel
      ? legacyCancelPayouts(
          answer,
          this.contract,
          this.metrics(),
          this.liquidities
        )
      : getPayouts(
          outcome,
          this.contract,
          this.metrics(),
          this.liquidities,
          undefined,
          probability,
          answerId
        )
  }

  // resolveMarketHelper for one answer. Returns what it paid out.
  resolve(answerId: string, outcome: Outcome, probability = 0.5) {
    const answer = this.answer(answerId)
    const open = this.open()
    const contractShare = this.subsidyPool / open.length
    const marketShare = this.marketHeld / open.length
    const { traderPayouts, liquidityPayouts } = this.payoutsFor(
      answerId,
      outcome,
      this.useLegacyCancel,
      probability
    )
    const payouts = [...traderPayouts, ...liquidityPayouts]
    const paid = sumBy(payouts, (p) => p.payout)

    const holds = this.held[answerId] + marketShare
    this.overpaid += Math.max(0, paid - holds - 1e-9 * (holds + 1))
    if (
      outcome === 'CANCEL' &&
      this.holdsFullShares[answerId] &&
      this.hasWholeMarketLiquidity()
    ) {
      const before = sumBy(
        this.payoutsFor(answerId, outcome, true).liquidityPayouts,
        (p) => p.payout
      )
      const now = sumBy(liquidityPayouts, (p) => p.payout)
      this.fullShareRefunds++
      this.shortChanged += Math.abs(before - now)
    }

    const marketResolved = open.length === 1
    this.resolved[answerId] = {
      payouts,
      answerSubsidyPool: answer.subsidyPool,
      held: this.held[answerId],
      poolShare: contractShare,
      marketShare,
    }
    const resolutionTime = this.clock++
    // recordContractEdit: the market as this resolution found it.
    this.edits.push({
      answerId,
      resolutionTime,
      subsidyPool: this.subsidyPool,
      openAnswerIds: open.map((a) => a.id),
    })
    for (const { userId, payout } of payouts) this.pay(userId, payout)
    this.held[answerId] = 0
    this.subsidyPool = marketResolved ? 0 : this.subsidyPool - contractShare
    this.marketHeld -= marketShare
    answer.subsidyPool = 0
    answer.resolution = outcome
    answer.resolutionTime = resolutionTime
    return paid
  }

  // undoResolution for one answer: the payouts come back and the answer's
  // pending subsidy is restored to what its resolution found. The market's
  // pool gets back the share that resolution took, as its edit records it.
  // (Every edit is on file here. The handler's test covers the ones that are
  // not.) Before, the pool was restored only when the market was resolved,
  // and then to what the latest edit held, which is the last resolution's,
  // whichever answer was unresolved.
  unresolve(answerId: string) {
    const answer = this.answer(answerId)
    const record = this.resolved[answerId]
    for (const { userId, payout } of record.payouts) this.pay(userId, -payout)
    this.held[answerId] = record.held
    answer.subsidyPool = record.answerSubsidyPool
    let restored = 0
    if (!this.useLegacyUnresolve) {
      restored = record.poolShare
      this.subsidyPool += restored
    } else if (this.open().length === 0) {
      restored = this.edits[this.edits.length - 1].subsidyPool
      this.subsidyPool = restored
    }
    // Only what this answer's resolution took of the pool can come back to
    // it: the rest of what was restored is not there.
    this.marketHeld += Math.min(restored, record.marketShare)
    answer.resolution = undefined
    answer.resolutionTime = undefined
    delete this.resolved[answerId]
    // Back to take a share of the subsidy still pending, without the share
    // its resolution took (that stays out of the market's pool), and having
    // missed whatever drizzled meanwhile.
    if (this.hasWholeMarketLiquidity()) this.noFullShares()
  }

  // Mana users have taken out of the market beyond what they put in.
  minted() {
    return sum(Object.values(this.balances))
  }
}

const refundOf = (market: IndependentMarket, answerId: string) =>
  sumBy(
    market.payoutsFor(answerId, 'CANCEL', false).liquidityPayouts,
    (p) => p.payout
  )

describe('cancelling an answer listed after a subsidy drizzled', () => {
  // The report: a market of two answers, a subsidy, a wait for the drizzle,
  // more answers, the first two resolved, the rest cancelled.
  const exploit = (mechanism: Mechanism, legacy: boolean) => {
    const market = new IndependentMarket(mechanism, 'creator', 2, 100_000)
    market.useLegacyCancel = legacy
    market.addLiquidity('creator', 1_000_000)
    for (let i = 0; i < 40; i++) market.drizzle(0.3)
    for (let i = 0; i < 11; i++) market.addAnswer('creator', 10_000)
    market.resolve('a0', 'NO')
    market.resolve('a1', 'NO')
    for (let i = 2; i < 13; i++) market.resolve(`a${i}`, 'CANCEL')
    return market
  }

  it.each(['cpmm-multi-1', 'cpmm-multi-2'] as const)(
    'paid the subsidy out twice before, on %s',
    (mechanism) => {
      const market = exploit(mechanism, true)
      // 11 of 13 shares of the subsidy, on top of everything put in.
      expect(market.minted()).toBeGreaterThan(846_000)
      expect(market.minted()).toBeLessThanOrEqual((1_000_000 * 11) / 13)
      expect(market.overpaid).toBeGreaterThan(846_000)
    }
  )

  it.each(['cpmm-multi-1', 'cpmm-multi-2'] as const)(
    'pays out what was put in and no more, on %s',
    (mechanism) => {
      const market = exploit(mechanism, false)
      expect(market.overpaid).toBe(0)
      expect(market.minted()).toBeLessThanOrEqual(1e-6)
      // Nothing is lost either: every answer returned what it held.
      expect(market.minted()).toBeCloseTo(0, 4)
    }
  )

  // The dev market the report came from, QtdQuOdSUd: the answers were listed
  // while most of the subsidy was still pending, so each cancelled answer held
  // its share of the pending pool and nothing else of the subsidy.
  it('refunds each late answer its ante and its share of the pending subsidy', () => {
    const pending = 893_650.3486181388
    const drizzled = (1_000_000 - pending) / 2
    const market = new IndependentMarket('cpmm-multi-2', 'creator', 2, 100_000)
    market.addLiquidity('creator', 1_000_000)
    market.drizzle(1 - pending / 1_000_000)
    expect(market.answers[0].poolYes).toBeCloseTo(50_000 + drizzled, 6)
    for (let i = 0; i < 11; i++) market.addAnswer('creator', 10_000)

    const share = pending / 13
    expect(market.resolve('a0', 'NO')).toBeCloseTo(50_000 + drizzled + share, 6)
    expect(market.resolve('a1', 'NO')).toBeCloseTo(50_000 + drizzled + share, 6)
    for (let i = 2; i < 13; i++) {
      // Was 10,000 + 1,000,000 / 13 = 86,923.08 each.
      expect(market.resolve(`a${i}`, 'CANCEL')).toBeCloseTo(10_000 + share, 6)
    }
    expect(market.overpaid).toBe(0)
    expect(market.minted()).toBeCloseTo(0, 4)
  })

  it('refunds a late answer only its own ante once the subsidy has drizzled', () => {
    const market = new IndependentMarket('cpmm-multi-2', 'creator', 2, 200)
    market.addLiquidity('creator', 9000)
    market.drizzle(1)
    const late = market.addAnswer('creator', 50)
    expect(refundOf(market, late)).toBeCloseTo(50, 9)
    // The answers that took the subsidy still refund their share of it.
    expect(refundOf(market, 'a0')).toBeCloseTo(100 + 9000 / 3, 9)
  })

  it('refunds a late answer what it did receive of a subsidy', () => {
    const market = new IndependentMarket('cpmm-multi-2', 'creator', 2, 200)
    market.addLiquidity('creator', 9000)
    market.drizzle(0.5) // 2,250 to each of the two answers
    const late = market.addAnswer('creator', 50)
    market.drizzle(1) // 1,500 to each of the three
    expect(refundOf(market, late)).toBeCloseTo(50 + 1500, 9)
  })

  it('shares what a late answer holds among the whole-market providers alike', () => {
    const market = new IndependentMarket('cpmm-multi-2', 'creator', 2, 200)
    market.addLiquidity('creator', 6000)
    market.addLiquidity('backer', 3000)
    market.drizzle(0.5)
    const late = market.addAnswer('adder', 50)
    market.drizzle(1)
    const { liquidityPayouts } = market.payoutsFor(late, 'CANCEL', false)
    const byUser = (userId: string) =>
      sumBy(
        liquidityPayouts.filter((p) => p.userId === userId),
        (p) => p.payout
      )
    expect(byUser('adder')).toBeCloseTo(50, 9)
    expect(byUser('creator')).toBeCloseTo(1000, 9)
    expect(byUser('backer')).toBeCloseTo(500, 9)
  })
})

describe('cancelling an answer that was resolved while a subsidy drizzled', () => {
  it.each(['cpmm-multi-1', 'cpmm-multi-2'] as const)(
    'refunds none of that subsidy, on %s',
    (mechanism) => {
      const market = new IndependentMarket(mechanism, 'creator', 2, 200)
      market.resolve('a1', 'NO')
      market.addLiquidity('creator', 5000)
      market.drizzle(1) // all of it to a0
      market.unresolve('a1')
      // Was 100 + 5,000 / 2.
      expect(market.resolve('a1', 'CANCEL')).toBeCloseTo(100, 9)
      expect(market.resolve('a0', 'YES')).toBeCloseTo(5100, 9)
      expect(market.overpaid).toBe(0)
      expect(market.minted()).toBeCloseTo(0, 6)
    }
  )
})

describe('cancelling an answer that was open for every subsidy', () => {
  it.each(['cpmm-multi-1', 'cpmm-multi-2'] as const)(
    'refunds its full share as before, drizzled or pending, on %s',
    (mechanism) => {
      for (const drizzles of [0, 1, 7, 60]) {
        const market = new IndependentMarket(mechanism, 'creator', 3, 300)
        market.addLiquidity('creator', 1234.5)
        market.addLiquidity('backer', 77.7)
        for (let i = 0; i < drizzles; i++) market.drizzle(0.3)
        for (const a of market.answers) {
          expect(market.payoutsFor(a.id, 'CANCEL', false)).toEqual(
            market.payoutsFor(a.id, 'CANCEL', true)
          )
        }
        for (const a of market.answers) market.resolve(a.id, 'CANCEL')
        expect(market.minted()).toBeCloseTo(0, 6)
        expect(market.overpaid).toBe(0)
      }
    }
  )

  const traded = (mechanism: Mechanism, crossFifty: boolean) => {
    const market = new IndependentMarket(mechanism, 'creator', 2, 200)
    market.buy('alice', 'a0', 'YES', 60)
    market.buy('bob', 'a0', 'NO', 25)
    market.addLiquidity('creator', 500)
    market.drizzle(0.4) // a0 above 50%
    market.buy('alice', 'a0', 'NO', crossFifty ? 30 : 5) // a partial sale
    market.buy('carol', 'a1', 'NO', 500)
    market.drizzle(1)
    return market
  }

  it('refunds its full share after trading moved its price, on cpmm-multi-2', () => {
    for (const crossFifty of [false, true]) {
      const market = traded('cpmm-multi-2', crossFifty)
      for (const a of market.answers) {
        expect(market.payoutsFor(a.id, 'CANCEL', false)).toEqual(
          market.payoutsFor(a.id, 'CANCEL', true)
        )
      }
      market.resolve('a0', 'CANCEL')
      market.resolve('a1', 'CANCEL')
      expect(market.minted()).toBeCloseTo(0, 6)
      expect(market.overpaid).toBe(0)
    }
  })

  // cpmm-multi-1 holds an answer's price through a subsidy by throwing shares
  // of the cheaper side away. While its subsidies all reach it on one side of
  // 50%, the other side still counts every mana it holds.
  it('refunds its full share after trading moved its price, on cpmm-multi-1, while subsidies reach it on one side of 50%', () => {
    const market = traded('cpmm-multi-1', false)
    expect(market.answers[0].prob).toBeGreaterThan(0.5)
    for (const a of market.answers) {
      expect(market.payoutsFor(a.id, 'CANCEL', false)).toEqual(
        market.payoutsFor(a.id, 'CANCEL', true)
      )
    }
  })

  // Once subsidies have reached it on both sides of 50%, neither side counts
  // all of it, and the refund of whole-market liquidity comes up short by the
  // smaller of what the two sides threw away. Never over.
  it('can refund a cpmm-multi-1 answer subsidised on both sides of 50% a little less than its share', () => {
    const market = traded('cpmm-multi-1', true)
    expect(market.answers[0].prob).toBeLessThan(0.5)
    const now = refundOf(market, 'a0')
    const before = sumBy(
      market.payoutsFor('a0', 'CANCEL', true).liquidityPayouts,
      (p) => p.payout
    )
    expect(before).toBeCloseTo(100 + 250, 9)
    expect(now).toBeLessThan(before)
    expect(now).toBeGreaterThan(before - 15)
    market.resolve('a0', 'CANCEL')
    market.resolve('a1', 'CANCEL')
    expect(market.overpaid).toBe(0)
    expect(market.minted()).toBeLessThanOrEqual(0)
  })

  it('refunds more than its share never, when other answers resolved first', () => {
    // a1 resolves before the subsidy, so a0 takes all of it but is refunded
    // amount / 2, as before: the limit only ever lowers a refund.
    const market = new IndependentMarket('cpmm-multi-2', 'creator', 2, 200)
    market.resolve('a1', 'NO')
    market.addLiquidity('creator', 1000)
    market.drizzle(1)
    expect(refundOf(market, 'a0')).toBeCloseTo(100 + 500, 9)
  })
})

describe('unresolving an answer of a resolved market', () => {
  // Resolve A, add a subsidy, resolve B, which pays it out, unresolve A,
  // resolve A again.
  const reopened = (mechanism: Mechanism, legacyUnresolve: boolean) => {
    const market = new IndependentMarket(mechanism, 'creator', 2, 200)
    market.useLegacyUnresolve = legacyUnresolve
    market.resolve('a0', 'YES')
    market.addLiquidity('creator', 1000)
    expect(market.resolve('a1', 'YES')).toBeCloseTo(1100, 9)
    market.unresolve('a0')
    return market
  }

  it.each(['cpmm-multi-1', 'cpmm-multi-2'] as const)(
    'put the subsidy the last answer had paid out back in the pool before, on %s',
    (mechanism) => {
      for (const outcome of ['YES', 'NO', 'MKT', 'CANCEL'] as const) {
        const market = reopened(mechanism, true)
        expect(market.subsidyPool).toBe(1000)
        // The cancellation is limited to amount / number of answers.
        const again = outcome === 'CANCEL' ? 600 : 1100
        expect(market.resolve('a0', outcome)).toBeCloseTo(again, 9)
        expect(market.minted()).toBeCloseTo(again - 100, 9)
        expect(market.overpaid).toBeCloseTo(again - 100, 6)
      }
    }
  )

  it.each(['cpmm-multi-1', 'cpmm-multi-2'] as const)(
    'leaves it out of the pool, on %s',
    (mechanism) => {
      for (const outcome of ['YES', 'NO', 'MKT', 'CANCEL'] as const) {
        const market = reopened(mechanism, false)
        expect(market.subsidyPool).toBe(0)
        expect(market.resolve('a0', outcome)).toBeCloseTo(100, 9)
        expect(market.minted()).toBeCloseTo(0, 9)
        expect(market.overpaid).toBe(0)
      }
    }
  )

  // Two answers that each took half the pool. The old rule got this one right
  // by coincidence: the pool as the last found it is what the first took.
  it('puts back the share the answer took when it was not the last to resolve', () => {
    for (const legacyUnresolve of [false, true]) {
      const market = new IndependentMarket('cpmm-multi-2', 'creator', 2, 200)
      market.useLegacyUnresolve = legacyUnresolve
      market.addLiquidity('creator', 1000)
      expect(market.resolve('a0', 'YES')).toBeCloseTo(600, 9)
      expect(market.resolve('a1', 'NO')).toBeCloseTo(600, 9)
      market.unresolve('a0')
      expect(market.subsidyPool).toBe(500)
      expect(market.resolve('a0', 'NO')).toBeCloseTo(600, 9)
      expect(market.minted()).toBeCloseTo(0, 9)
      expect(market.overpaid).toBe(0)
    }
  })

  it('puts back the share an answer took while the market is still open', () => {
    const market = new IndependentMarket('cpmm-multi-2', 'creator', 3, 300)
    market.addLiquidity('creator', 900)
    expect(market.resolve('a0', 'YES')).toBeCloseTo(400, 9)
    market.unresolve('a0')
    // Was 600: the share stayed out of the pool for good.
    expect(market.subsidyPool).toBe(900)
    expect(market.marketHeld).toBe(900)
    for (const a of market.answers) market.resolve(a.id, 'CANCEL')
    expect(market.minted()).toBeCloseTo(0, 9)
    expect(market.overpaid).toBe(0)
  })

  it('still puts the pool back for the answer whose resolution took it', () => {
    const market = new IndependentMarket('cpmm-multi-2', 'creator', 2, 200)
    market.addLiquidity('creator', 1000)
    market.resolve('a0', 'YES')
    expect(market.resolve('a1', 'NO')).toBeCloseTo(600, 9)
    market.unresolve('a1')
    expect(market.subsidyPool).toBe(500)
    expect(market.marketHeld).toBe(500)
    expect(market.resolve('a1', 'YES')).toBeCloseTo(600, 9)
    expect(market.minted()).toBeCloseTo(0, 9)
    expect(market.overpaid).toBe(0)
  })
})

describe('what an answer holds', () => {
  const answer = (poolYes: number, poolNo: number, subsidyPool = 0) =>
    ({ id: 'a', poolYes, poolNo, subsidyPool } as Answer)
  const metric = (YES: number, NO: number) =>
    ({ answerId: 'a', totalShares: { YES, NO } } as unknown as ContractMetric)

  it('is the larger side of its shares, in the pool and out, plus pending subsidy', () => {
    expect(getIndependentMultiAnswerBacking(answer(100, 100), [], 0)).toBe(100)
    expect(
      getIndependentMultiAnswerBacking(
        answer(60, 150, 7),
        [metric(90, 0), metric(0, 20)],
        3
      )
    ).toBe(170 + 7 + 3)
  })

  // One subsidy is enough for that where the answer opened at custom odds:
  // the opening threw shares of one side away, the subsidy of the other.
  it('counts a cpmm-multi-1 answer opened at custom odds short after a subsidy on the other side of 50%', () => {
    const opening = getPoolAtProb(0.2, 100)
    expect(opening).toEqual({ YES: 100, NO: 25 })
    const bought = calculateCpmmPurchase(
      { pool: opening, p: 0.5, collectedFees: noFees },
      200,
      'YES',
      true
    )
    expect(getCpmmProbability(bought.newPool, 0.5)).toBeGreaterThan(0.5)
    const { newPool } = addCpmmLiquidityFixedP(
      bought.newPool as { YES: number; NO: number },
      100
    )
    const subsidised = {
      ...answer(newPool.YES, newPool.NO),
      contractId: 'c',
    } as Answer
    const position = {
      userId: 'trader',
      answerId: 'a',
      totalShares: { YES: bought.shares, NO: 0 },
      totalAmountInvested: 200,
      totalAmountSold: 0,
    } as unknown as ContractMetric

    // It holds its ante of 100, the bet of 200 and the subsidy of 100.
    expect(
      getIndependentMultiAnswerBacking(subsidised, [position], 0)
    ).toBeCloseTo(325, 9)
    const { traderPayouts, liquidityPayouts } = getPayouts(
      'CANCEL',
      {
        mechanism: 'cpmm-multi-1',
        shouldAnswersSumToOne: false,
        answers: [subsidised],
        subsidyPool: 0,
      } as unknown as CPMMMultiContract,
      [position],
      [
        { userId: 'own', answerId: 'a', amount: 100 },
        { userId: 'whole', amount: 100 },
      ] as LiquidityProvision[],
      undefined,
      undefined,
      'a'
    )
    expect(traderPayouts).toEqual([{ userId: 'trader', payout: 200 }])
    expect(liquidityPayouts[0]).toEqual({ userId: 'own', payout: 100 })
    expect(liquidityPayouts[1].payout).toBeCloseTo(25, 9)
  })

  it('refunds no whole-market liquidity out of a pool that is not a number', () => {
    const broken = { ...answer(NaN, 100), contractId: 'c' } as Answer
    const { liquidityPayouts } = getPayouts(
      'CANCEL',
      {
        mechanism: 'cpmm-multi-2',
        shouldAnswersSumToOne: false,
        answers: [broken, answer(100, 100)],
        subsidyPool: 0,
      } as unknown as CPMMMultiContract,
      [],
      [
        { userId: 'own', answerId: 'a', amount: 100 },
        { userId: 'whole', amount: 1000 },
      ] as LiquidityProvision[],
      undefined,
      undefined,
      'a'
    )
    expect(liquidityPayouts).toEqual([
      { userId: 'own', payout: 100 },
      { userId: 'whole', payout: 0 },
    ])
  })

  it('still charges a withdrawal recorded against the whole market in full', () => {
    const late = { ...answer(50, 50), contractId: 'c' } as Answer
    const { liquidityPayouts } = getPayouts(
      'CANCEL',
      {
        mechanism: 'cpmm-multi-2',
        shouldAnswersSumToOne: false,
        answers: [late, answer(100, 100)],
        subsidyPool: 0,
      } as unknown as CPMMMultiContract,
      [],
      [
        { userId: 'own', answerId: 'a', amount: 30 },
        { userId: 'whole', amount: 1000 },
        { userId: 'whole', amount: -200 },
      ] as LiquidityProvision[],
      undefined,
      undefined,
      'a'
    )
    // It holds 50: 30 for its own provision, 20 for the whole-market ones,
    // whose refunds of 500 and -100 would have come to 400.
    expect(liquidityPayouts[0]).toEqual({ userId: 'own', payout: 30 })
    expect(liquidityPayouts[1].payout).toBeCloseTo(120, 9)
    expect(liquidityPayouts[2]).toEqual({ userId: 'whole', payout: -100 })
    expect(sumBy(liquidityPayouts, (p) => p.payout)).toBeCloseTo(50, 9)
  })
})

// Seeded, so a failure reproduces.
const mulberry32 = (seed: number) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const randomLifecycle = (
  mechanism: Mechanism,
  seed: number,
  // Which of the two behaviours to run as they were before the fixes.
  legacy: { cancel?: boolean; unresolve?: boolean } = {}
) => {
  const random = mulberry32(seed)
  const pick = <T>(items: T[]) => items[Math.floor(random() * items.length)]
  const users = ['creator', 'alice', 'bob', 'carol']
  const outcomes: Outcome[] = ['YES', 'NO', 'MKT', 'CANCEL', 'CANCEL']

  const market = new IndependentMarket(
    mechanism,
    'creator',
    1 + Math.floor(random() * 4),
    100 + Math.floor(random() * 5000)
  )
  market.useLegacyCancel = !!legacy.cancel
  market.useLegacyUnresolve = !!legacy.unresolve

  const steps = 20 + Math.floor(random() * 40)
  for (let step = 0; step < steps; step++) {
    const open = market.open()
    const closed = market.answers.filter((a) => a.resolution)
    const roll = random()
    if (roll < 0.14) {
      if (open.length > 0)
        market.addLiquidity(pick(users), 10 + random() * 20_000)
    } else if (roll < 0.34) {
      market.drizzle(random() < 0.2 ? 1 : random() * 0.6)
    } else if (roll < 0.5) {
      if (open.length > 0 && market.answers.length < 30)
        market.addAnswer(pick(users), 1 + random() * 500)
    } else if (roll < 0.75) {
      if (open.length > 0)
        market.buy(
          pick(users),
          pick(open).id,
          pick(['YES', 'NO'] as const),
          1 + random() * 2000
        )
    } else if (roll < 0.8) {
      if (open.length > 0 && mechanism === 'cpmm-multi-2')
        market.addAnswerLiquidity(
          pick(users),
          pick(open).id,
          1 + random() * 3000
        )
    } else if (roll < 0.93) {
      if (open.length > 0)
        market.resolve(pick(open).id, pick(outcomes), random())
    } else if (closed.length > 0) {
      market.unresolve(pick(closed).id)
    }
  }
  for (const a of market.open()) market.resolve(a.id, pick(outcomes), random())
  return market
}

describe('random lifecycles of an independent market', () => {
  // CANCEL_FUZZ_SEEDS=50000 for a longer run.
  const SEEDS = Number(process.env.CANCEL_FUZZ_SEEDS) || 400

  it.each(['cpmm-multi-1', 'cpmm-multi-2'] as const)(
    'never pay out more than an answer holds, on %s',
    (mechanism) => {
      for (let seed = 1; seed <= SEEDS; seed++) {
        const market = randomLifecycle(mechanism, seed)
        const moved = sum(Object.values(market.balances).map(Math.abs))
        if (market.overpaid > 0 || market.minted() > 1e-9 * moved + 1e-6)
          throw new Error(
            `${mechanism} seed ${seed}: overpaid ${
              market.overpaid
            }, minted ${market.minted()}`
          )
      }
    }
  )

  // cpmm-multi-2 adds liquidity without discarding shares, so what an answer
  // holds is counted exactly, and an answer that holds its full share of every
  // subsidy is refunded exactly what it was before. (cpmm-multi-1 can count
  // an answer short when subsidies reached it on both sides of 50%; see
  // above.)
  it('refund an answer that holds its share of every subsidy exactly as before, on cpmm-multi-2', () => {
    let refunds = 0
    for (let seed = 1; seed <= SEEDS; seed++) {
      const market = randomLifecycle('cpmm-multi-2', seed)
      if (market.shortChanged > 0)
        throw new Error(`seed ${seed}: changed by ${market.shortChanged}`)
      refunds += market.fullShareRefunds
    }
    // Enough such cancellations for the check to mean something.
    expect(refunds).toBeGreaterThan(SEEDS / 10)
  })

  // The check has teeth: the refund as it was fails it,
  it.each(['cpmm-multi-1', 'cpmm-multi-2'] as const)(
    'did pay out more than answers held with the refund as it was, on %s',
    (mechanism) => {
      let overpaying = 0
      let minting = 0
      for (let seed = 1; seed <= SEEDS; seed++) {
        const market = randomLifecycle(mechanism, seed, { cancel: true })
        if (market.overpaid > 1) overpaying++
        if (market.minted() > 1) minting++
      }
      expect(overpaying).toBeGreaterThan(SEEDS / 10)
      expect(minting).toBeGreaterThan(0)
    }
  )

  // and so does the unresolve as it was, with the refund fixed.
  it.each(['cpmm-multi-1', 'cpmm-multi-2'] as const)(
    'did pay out more than answers held with the unresolve as it was, on %s',
    (mechanism) => {
      let overpaying = 0
      let minting = 0
      for (let seed = 1; seed <= SEEDS; seed++) {
        const market = randomLifecycle(mechanism, seed, { unresolve: true })
        if (market.overpaid > 1) overpaying++
        if (market.minted() > 1) minting++
      }
      expect(overpaying).toBeGreaterThan(0)
      expect(minting).toBeGreaterThan(0)
    }
  )
})
