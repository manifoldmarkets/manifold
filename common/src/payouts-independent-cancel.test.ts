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
//
// Liquidity added to the whole market now goes to the answers open at that
// moment, as each one's own pending subsidy, and the provision records them
// (addSubsidyToOpenAnswers). An answer listed later holds none of it and
// refunds none of it, and a provider is paid by what they put into each
// answer. Markets keep the provisions made before that, which record no
// answers and went through the market's pool: the market below can make
// either kind.
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
  getIndependentMultiCancelPayouts,
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
  resolved: Record<string, Resolved> = {}
  // When each answer was resolved, and until when if that was undone.
  resolvedSpans: Record<string, [number, number | undefined][]> = {}
  // Total a resolution paid out beyond what its answer held.
  overpaid = 0
  // Cancellations in a market whose provisions record no answers, and the
  // total by which they refunded less whole-market liquidity than the limit
  // on its own would, with every provision at amount / number of answers.
  unrecordedRefunds = 0
  belowLimitAlone = 0
  unresolvesRefused = 0
  // Events are a minute apart: an answer listed within seconds of a provision
  // counts as one it was made for.
  clock = 1_700_000_000_000
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

  private tick() {
    this.clock += 60_000
    return this.clock
  }

  private insertAnswer(userId: string, amount: number) {
    const id = `a${this.answers.length}`
    this.answers.push({
      id,
      index: this.answers.length,
      contractId: 'c',
      userId,
      text: id,
      createdTime: this.tick(),
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
      createdTime: this.tick(),
      isAnte: true,
      answerId: id,
      amount,
    })
    this.pay(userId, -amount)
    this.held[id] = amount
    return id
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

  // addContractLiquidity for the whole market: to the answers open now, in
  // equal shares, as each one's own pending subsidy, and a provision that
  // records them. Refused when no answer is open.
  addLiquidity(userId: string, amount: number) {
    const open = this.open()
    if (open.length === 0) return false
    this.pay(userId, -amount)
    for (const a of open) {
      a.subsidyPool += amount / open.length
      this.held[a.id] += amount / open.length
    }
    this.liquidities.push({
      id: `l${this.liquidities.length}`,
      userId,
      contractId: 'c',
      createdTime: this.tick(),
      amount,
      answerIds: open.map((a) => a.id),
    })
    return true
  }

  // The same before provisions recorded their answers: the market's subsidy
  // pool, and a provision with no answer. Markets hold these from then.
  addUnrecordedLiquidity(userId: string, amount: number) {
    this.pay(userId, -amount)
    this.subsidyPool += amount
    this.marketHeld += amount
    this.liquidities.push({
      id: `l${this.liquidities.length}`,
      userId,
      contractId: 'c',
      createdTime: this.tick(),
      amount,
    })
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
      createdTime: this.tick(),
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
      !this.useLegacyCancel &&
      this.liquidities.some((l) => !l.answerId) &&
      !this.liquidities.some((l) => l.answerIds)
    ) {
      const limitAlone = sumBy(
        getIndependentMultiCancelPayouts(
          answer,
          this.metrics(),
          this.liquidities.filter((l) => l.answerId === answerId),
          this.liquidities
            .filter((l) => !l.answerId)
            .map((l) => ({ ...l, amount: l.amount / this.answers.length })),
          contractShare
        ).liquidityPayouts,
        (p) => p.payout
      )
      const now = sumBy(liquidityPayouts, (p) => p.payout)
      this.unrecordedRefunds++
      this.belowLimitAlone += Math.max(
        0,
        limitAlone - now - 1e-9 * (limitAlone + 1)
      )
    }

    const marketResolved = open.length === 1
    this.resolved[answerId] = {
      payouts,
      answerSubsidyPool: answer.subsidyPool,
      held: this.held[answerId],
      poolShare: contractShare,
      marketShare,
    }
    const resolutionTime = this.tick()
    ;(this.resolvedSpans[answerId] ??= []).push([resolutionTime, undefined])
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
  //
  // verifyUserCanUnresolve refuses it once a whole-market provision that
  // records no answers came while the answer was resolved, now or in a
  // resolution since undone: a cancellation credits such a provision to the
  // answers open when it was made, and afterwards nothing would say this one
  // wasn't. `unchecked` is the unresolve from before that check.
  refusesUnresolve(answerId: string) {
    const spans = this.resolvedSpans[answerId] ?? []
    return this.liquidities.some(
      (l) =>
        !l.answerId &&
        !l.answerIds &&
        spans.some(
          ([from, until]) =>
            l.createdTime > from &&
            (until === undefined || l.createdTime < until)
        )
    )
  }

  unresolve(answerId: string, unchecked = false) {
    if (
      !unchecked &&
      !this.useLegacyUnresolve &&
      this.refusesUnresolve(answerId)
    ) {
      this.unresolvesRefused++
      return false
    }
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
    const spans = this.resolvedSpans[answerId]
    spans[spans.length - 1][1] = this.tick()
    return true
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
  const exploit = (
    mechanism: Mechanism,
    legacyCancel: boolean,
    recorded = false
  ) => {
    const market = new IndependentMarket(mechanism, 'creator', 2, 100_000)
    market.useLegacyCancel = legacyCancel
    if (recorded) market.addLiquidity('creator', 1_000_000)
    else market.addUnrecordedLiquidity('creator', 1_000_000)
    for (let i = 0; i < 40; i++) market.drizzle(0.3)
    for (let i = 0; i < 11; i++) market.addAnswer('creator', 10_000)
    market.resolve('a0', 'NO')
    market.resolve('a1', 'NO')
    const refunds = []
    for (let i = 2; i < 13; i++) refunds.push(market.resolve(`a${i}`, 'CANCEL'))
    return { market, refunds }
  }

  it.each(['cpmm-multi-1', 'cpmm-multi-2'] as const)(
    'paid the subsidy out twice before, on %s',
    (mechanism) => {
      const { market } = exploit(mechanism, true)
      // 11 of 13 shares of the subsidy, on top of everything put in.
      expect(market.minted()).toBeGreaterThan(846_000)
      expect(market.minted()).toBeLessThanOrEqual((1_000_000 * 11) / 13)
      expect(market.overpaid).toBeGreaterThan(846_000)
    }
  )

  // A subsidy from before provisions recorded their answers, as markets hold
  // them now.
  it.each(['cpmm-multi-1', 'cpmm-multi-2'] as const)(
    'pays out what was put in and no more, on %s',
    (mechanism) => {
      const { market } = exploit(mechanism, false)
      expect(market.overpaid).toBe(0)
      expect(market.minted()).toBeLessThanOrEqual(1e-6)
      // Nothing is lost either: every answer returned what it held.
      expect(market.minted()).toBeCloseTo(0, 4)
    }
  )

  // The same subsidy made now: all of it is the first two answers' from the
  // start, and the later ones never hold any.
  it.each(['cpmm-multi-1', 'cpmm-multi-2'] as const)(
    'pays a subsidy that records its answers out through them alone, on %s',
    (mechanism) => {
      const { market, refunds } = exploit(mechanism, false, true)
      for (const refund of refunds) expect(refund).toBeCloseTo(10_000, 6)
      expect(market.overpaid).toBe(0)
      expect(market.minted()).toBeCloseTo(0, 4)
    }
  )

  // The refund as it was takes such a provision for one that records no
  // answers. Every process that pays out has to run the same code.
  it('is still paid out twice by the refund as it was', () => {
    const { market } = exploit('cpmm-multi-2', true, true)
    expect(market.minted()).toBeGreaterThan(846_000)
  })

  // The dev market the report came from, QtdQuOdSUd: the answers were listed
  // while most of the subsidy was still pending, so each cancelled answer held
  // its share of the pending pool and nothing else of the subsidy.
  it('refunds each late answer its ante and its share of the pending subsidy', () => {
    const pending = 893_650.3486181388
    const drizzled = (1_000_000 - pending) / 2
    const market = new IndependentMarket('cpmm-multi-2', 'creator', 2, 100_000)
    market.addUnrecordedLiquidity('creator', 1_000_000)
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
    market.addUnrecordedLiquidity('creator', 9000)
    market.drizzle(1)
    const late = market.addAnswer('creator', 50)
    expect(refundOf(market, late)).toBeCloseTo(50, 9)
    // The two answers that took the subsidy refund all of it between them.
    // (Was 100 + 9,000 / 3: the third share was refunded to nobody.)
    expect(refundOf(market, 'a0')).toBeCloseTo(100 + 9000 / 2, 9)
  })

  it('refunds a late answer what it did receive of a subsidy', () => {
    const market = new IndependentMarket('cpmm-multi-2', 'creator', 2, 200)
    market.addUnrecordedLiquidity('creator', 9000)
    market.drizzle(0.5) // 2,250 to each of the two answers
    const late = market.addAnswer('creator', 50)
    market.drizzle(1) // 1,500 to each of the three
    expect(refundOf(market, late)).toBeCloseTo(50 + 1500, 9)
  })

  it('shares what a late answer holds among the whole-market providers alike', () => {
    const market = new IndependentMarket('cpmm-multi-2', 'creator', 2, 200)
    market.addUnrecordedLiquidity('creator', 6000)
    market.addUnrecordedLiquidity('backer', 3000)
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
      market.addUnrecordedLiquidity('creator', 5000)
      market.drizzle(1) // all of it to a0
      // The answer can't be reopened now. One reopened before that check:
      expect(market.unresolve('a1')).toBe(false)
      expect(market.unresolve('a1', true)).toBe(true)
      // Was 100 + 5,000 / 2.
      expect(market.resolve('a1', 'CANCEL')).toBeCloseTo(100, 9)
      expect(market.resolve('a0', 'YES')).toBeCloseTo(5100, 9)
      expect(market.overpaid).toBe(0)
      expect(market.minted()).toBeCloseTo(0, 6)
    }
  )

  it.each(['cpmm-multi-1', 'cpmm-multi-2'] as const)(
    'reopens and refunds none of a subsidy that records the answers it went to, on %s',
    (mechanism) => {
      const market = new IndependentMarket(mechanism, 'creator', 2, 200)
      market.resolve('a1', 'NO')
      market.addLiquidity('creator', 5000)
      market.drizzle(0.5)
      expect(market.unresolve('a1')).toBe(true)
      expect(market.resolve('a1', 'CANCEL')).toBeCloseTo(100, 9)
      expect(market.resolve('a0', 'CANCEL')).toBeCloseTo(5100, 9)
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
        market.addUnrecordedLiquidity('creator', 1234.5)
        market.addUnrecordedLiquidity('backer', 77.7)
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

  it.each(['cpmm-multi-1', 'cpmm-multi-2'] as const)(
    'refunds the share a subsidy records for it, drizzled or pending, on %s',
    (mechanism) => {
      for (const drizzles of [0, 1, 7, 60]) {
        const market = new IndependentMarket(mechanism, 'creator', 3, 300)
        market.addLiquidity('creator', 1234.5)
        market.addLiquidity('backer', 77.7)
        for (let i = 0; i < drizzles; i++) market.drizzle(0.3)
        for (const a of market.answers) {
          expect(refundOf(market, a.id)).toBeCloseTo(
            100 + (1234.5 + 77.7) / 3,
            9
          )
        }
        for (const a of market.answers) market.resolve(a.id, 'CANCEL')
        expect(market.balances.creator).toBeCloseTo(0, 9)
        expect(market.balances.backer).toBeCloseTo(0, 9)
        expect(market.overpaid).toBe(0)
      }
    }
  )

  const traded = (mechanism: Mechanism, crossFifty: boolean) => {
    const market = new IndependentMarket(mechanism, 'creator', 2, 200)
    market.buy('alice', 'a0', 'YES', 60)
    market.buy('bob', 'a0', 'NO', 25)
    market.addUnrecordedLiquidity('creator', 500)
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

  it('refunds all of a subsidy made when it was the only answer open', () => {
    // a1 resolves before the subsidy, so a0 takes all of it. It was refunded
    // amount / 2, and the other half to nobody.
    const market = new IndependentMarket('cpmm-multi-2', 'creator', 2, 200)
    market.resolve('a1', 'NO')
    market.addUnrecordedLiquidity('creator', 1000)
    market.drizzle(1)
    expect(refundOf(market, 'a0')).toBeCloseTo(100 + 1000, 9)
  })
})

// The report's other half: 5,000 added to a market of 64 answers when 6 were
// still open, 833.33 to each, beside 100 of the creator's in each.
describe('paying an answer out to the providers of its liquidity', () => {
  const sixOfSixtyFour = (recorded: boolean) => {
    const market = new IndependentMarket('cpmm-multi-2', 'creator', 64, 6400)
    for (let i = 6; i < 64; i++) market.resolve(`a${i}`, 'NO')
    if (recorded) market.addLiquidity('provider', 5000)
    else market.addUnrecordedLiquidity('provider', 5000)
    for (let i = 0; i < 60; i++) market.drizzle(0.3)
    for (let i = 0; i < 6; i++) market.resolve(`a${i}`, 'NO')
    return market
  }

  it('paid a provider by amount / number of answers, whichever answers took it', () => {
    const market = sixOfSixtyFour(false)
    // 5,000 / 64 = 78.1 beside the creator's 100 in each answer: 43.9% of
    // pools that are 89.3% the provider's.
    expect(market.balances.provider).toBeCloseTo(
      6 * (933 + 1 / 3) * (78.125 / 178.125) - 5000,
      6
    )
    expect(market.balances.provider).toBeLessThan(-2500)
    expect(market.balances.creator).toBeGreaterThan(2500)
    expect(market.minted()).toBeCloseTo(0, 6)
  })

  it('pays a provider by what they put into each answer', () => {
    const market = sixOfSixtyFour(true)
    expect(market.balances.provider).toBeCloseTo(0, 6)
    expect(market.balances.creator).toBeCloseTo(0, 6)
  })
})

describe('unresolving an answer of a resolved market', () => {
  // Resolve A, add a subsidy, resolve B, which pays it out, unresolve A,
  // resolve A again.
  const reopened = (mechanism: Mechanism, legacyUnresolve: boolean) => {
    const market = new IndependentMarket(mechanism, 'creator', 2, 200)
    market.useLegacyUnresolve = legacyUnresolve
    market.resolve('a0', 'YES')
    market.addUnrecordedLiquidity('creator', 1000)
    expect(market.resolve('a1', 'YES')).toBeCloseTo(1100, 9)
    // Refused now, the subsidy having come while a0 was resolved. As it went
    // before that check:
    if (!legacyUnresolve) expect(market.unresolve('a0')).toBe(false)
    market.unresolve('a0', true)
    return market
  }

  it.each(['cpmm-multi-1', 'cpmm-multi-2'] as const)(
    'put the subsidy the last answer had paid out back in the pool before, on %s',
    (mechanism) => {
      for (const outcome of ['YES', 'NO', 'MKT', 'CANCEL'] as const) {
        const market = reopened(mechanism, true)
        expect(market.subsidyPool).toBe(1000)
        // The cancellation is limited to the share of the two answers that
        // look to have been open for it.
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

  // The subsidy made now is the last answer's own from the start, and the
  // first can reopen.
  it.each(['cpmm-multi-1', 'cpmm-multi-2'] as const)(
    'has nothing to put back of a subsidy that records the answer it went to, on %s',
    (mechanism) => {
      for (const outcome of ['YES', 'NO', 'MKT', 'CANCEL'] as const) {
        const market = new IndependentMarket(mechanism, 'creator', 2, 200)
        market.resolve('a0', 'YES')
        market.addLiquidity('creator', 1000)
        expect(market.resolve('a1', 'YES')).toBeCloseTo(1100, 9)
        expect(market.unresolve('a0')).toBe(true)
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
      market.addUnrecordedLiquidity('creator', 1000)
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
    market.addUnrecordedLiquidity('creator', 900)
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
    market.addUnrecordedLiquidity('creator', 1000)
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

type Lifecycle = {
  // The refund and the unresolve as they were before the fixes.
  legacyCancel?: boolean
  legacyUnresolve?: boolean
  // Whole-market liquidity that records its answers, as it is added now, that
  // doesn't, as markets hold it from before, or some of each.
  adds?: 'recorded' | 'unrecorded' | 'mixed'
  trades?: boolean
  // Unresolve without the check on liquidity added meanwhile.
  unchecked?: boolean
}

const randomLifecycle = (
  mechanism: Mechanism,
  seed: number,
  {
    legacyCancel,
    legacyUnresolve,
    adds = 'mixed',
    trades = true,
    unchecked,
  }: Lifecycle = {}
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
  market.useLegacyCancel = !!legacyCancel
  market.useLegacyUnresolve = !!legacyUnresolve

  const steps = 20 + Math.floor(random() * 40)
  for (let step = 0; step < steps; step++) {
    const open = market.open()
    const closed = market.answers.filter((a) => a.resolution)
    const roll = random()
    if (roll < 0.14) {
      const userId = pick(users)
      const amount = 10 + random() * 20_000
      const recorded =
        adds === 'recorded' || (adds === 'mixed' && random() < 0.5)
      if (open.length === 0) continue
      if (recorded) market.addLiquidity(userId, amount)
      else market.addUnrecordedLiquidity(userId, amount)
    } else if (roll < 0.34) {
      market.drizzle(random() < 0.2 ? 1 : random() * 0.6)
    } else if (roll < 0.5) {
      if (open.length > 0 && market.answers.length < 30)
        market.addAnswer(pick(users), 1 + random() * 500)
    } else if (roll < 0.75) {
      const userId = pick(users)
      const outcome = pick(['YES', 'NO'] as const)
      const amount = 1 + random() * 2000
      if (open.length > 0 && trades)
        market.buy(userId, pick(open).id, outcome, amount)
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
      market.unresolve(pick(closed).id, unchecked)
    }
  }
  for (const a of market.open()) market.resolve(a.id, pick(outcomes), random())
  return market
}

describe('random lifecycles of an independent market', () => {
  // CANCEL_FUZZ_SEEDS=50000 for a longer run.
  const SEEDS = Number(process.env.CANCEL_FUZZ_SEEDS) || 400

  const expectNothingCreated = (mechanism: Mechanism, lifecycle: Lifecycle) => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const market = randomLifecycle(mechanism, seed, lifecycle)
      const moved = sum(Object.values(market.balances).map(Math.abs))
      if (market.overpaid > 0 || market.minted() > 1e-9 * moved + 1e-6)
        throw new Error(
          `${mechanism} seed ${seed}: overpaid ${
            market.overpaid
          }, minted ${market.minted()}`
        )
    }
  }

  it.each(['cpmm-multi-1', 'cpmm-multi-2'] as const)(
    'never pay out more than an answer holds, on %s',
    (mechanism) => {
      expectNothingCreated(mechanism, {})
      expectNothingCreated(mechanism, { adds: 'recorded' })
      expectNothingCreated(mechanism, { adds: 'unrecorded' })
    }
  )

  // The limit on a cancellation is what holds that, not the check on
  // unresolving, which is there for the split between providers.
  it.each(['cpmm-multi-1', 'cpmm-multi-2'] as const)(
    'nor with answers reopened after liquidity that records no answers, on %s',
    (mechanism) => {
      expectNothingCreated(mechanism, { unchecked: true })
      expectNothingCreated(mechanism, { adds: 'unrecorded', unchecked: true })
    }
  )

  it.each(['cpmm-multi-1', 'cpmm-multi-2'] as const)(
    'do refuse some unresolves and allow others, on %s',
    (mechanism) => {
      let refused = 0
      let reopened = 0
      for (let seed = 1; seed <= SEEDS; seed++) {
        const market = randomLifecycle(mechanism, seed)
        refused += market.unresolvesRefused
        reopened += sumBy(
          Object.values(market.resolvedSpans),
          (spans) => spans.length - 1
        )
      }
      expect(refused).toBeGreaterThan(SEEDS / 20)
      expect(reopened).toBeGreaterThan(SEEDS / 2)
    }
  )

  // cpmm-multi-2 adds liquidity without discarding shares, so what an answer
  // holds is counted exactly. With every provision assigned to answers as it
  // is made, each answer pays out or refunds exactly what it holds, whatever
  // the outcomes: nothing is created and nothing is left behind.
  it('return everything put in when provisions record their answers, on cpmm-multi-2', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const market = randomLifecycle('cpmm-multi-2', seed, { adds: 'recorded' })
      const moved = sum(Object.values(market.balances).map(Math.abs))
      if (Math.abs(market.minted()) > 1e-9 * moved + 1e-6)
        throw new Error(`seed ${seed}: left ${-market.minted()} behind`)
    }
  })

  // And each provider gets back what they put in. Without trading there are
  // no profits or losses to share, so that is exact for every provider,
  // whatever the outcomes, on either mechanism.
  const unevenSeeds = (mechanism: Mechanism, adds: Lifecycle['adds']) => {
    let uneven = 0
    for (let seed = 1; seed <= SEEDS; seed++) {
      const market = randomLifecycle(mechanism, seed, { adds, trades: false })
      const moved = sum(Object.values(market.balances).map(Math.abs))
      const worst = Math.max(...Object.values(market.balances).map(Math.abs))
      if (worst > 1e-9 * moved + 1e-6) uneven++
    }
    return uneven
  }

  it.each(['cpmm-multi-1', 'cpmm-multi-2'] as const)(
    'return each provider what they put in when provisions record their answers, on %s',
    (mechanism) => {
      expect(unevenSeeds(mechanism, 'recorded')).toBe(0)
    }
  )

  it.each(['cpmm-multi-1', 'cpmm-multi-2'] as const)(
    'did not with provisions that record no answers, on %s',
    (mechanism) => {
      expect(unevenSeeds(mechanism, 'unrecorded')).toBeGreaterThan(SEEDS / 10)
    }
  )

  // For the provisions markets hold from before, the share a cancelled answer
  // may refund is never smaller than it was, so no cancellation refunds less
  // than the limit on its own would.
  it.each(['cpmm-multi-1', 'cpmm-multi-2'] as const)(
    'refund no less of older liquidity than the limit alone, on %s',
    (mechanism) => {
      let refunds = 0
      for (let seed = 1; seed <= SEEDS; seed++) {
        const market = randomLifecycle(mechanism, seed, { adds: 'unrecorded' })
        if (market.belowLimitAlone > 0)
          throw new Error(`seed ${seed}: ${market.belowLimitAlone} less`)
        refunds += market.unrecordedRefunds
      }
      // Enough such cancellations for the check to mean something.
      expect(refunds).toBeGreaterThan(SEEDS / 2)
    }
  )

  // The check has teeth: the refund as it was fails it,
  it.each(['cpmm-multi-1', 'cpmm-multi-2'] as const)(
    'did pay out more than answers held with the refund as it was, on %s',
    (mechanism) => {
      let overpaying = 0
      let minting = 0
      for (let seed = 1; seed <= SEEDS; seed++) {
        const market = randomLifecycle(mechanism, seed, {
          legacyCancel: true,
          adds: 'unrecorded',
        })
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
        const market = randomLifecycle(mechanism, seed, {
          legacyUnresolve: true,
          adds: 'unrecorded',
        })
        if (market.overpaid > 1) overpaying++
        if (market.minted() > 1) minting++
      }
      expect(overpaying).toBeGreaterThan(0)
      expect(minting).toBeGreaterThan(0)
    }
  )
})
