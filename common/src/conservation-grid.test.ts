// cpmm-multi-2 conservation grid (Level-1, jest).
//
// Drives the REAL vendor calc + payout functions through create -> trades -> add-liquidity
// -> resolve scenarios and asserts the master conservation law:
//
//     Sum over all users (final balance - initial balance) + fees collected == 0
//
// (the market neither creates nor destroys mana; fees are the only sink — currently 0).
// Plus per-step invariants: Sum p == 1 (sum-to-one), prob in (0,1), and the GP16 conservation
// locus T_i^YES - T_i^NO constant across answers. This is the bug class that hid the m>1
// basket leak (calc-layer); it would have caught it (self-verified below).
//
// Scenario shapes are drawn from the pairwise covering array
// (tasks/cpmm_multi_2/covering-array.txt). This file covers the rows whose ops are calc-layer
// (create, single/multibet buy, whole-market add-liquidity, resolve). DEFERRED to the next
// increment / the instance harness: trade=sell, limits!=none, liq_target=single_outcome
// (per-answer addLiquidity not yet built for v2).
import { sumBy } from 'lodash'
import { Answer } from './answer'
import { LimitBet } from './bet'
import {
  addCpmmLiquidity,
  addCpmmMultiLiquidityAnswersSumToOneV2,
  addCpmmMultiLiquidityToAnswersIndependentlyV2,
  calculateCpmmMultiSumsToOneSale,
  calculateCpmmPurchase,
  calculateCpmmSale,
  getCpmmProbability,
} from './calculate-cpmm'
import {
  calculateCpmmMultiArbitrageBet,
  calculateCpmmMultiArbitrageYesBets,
} from './calculate-cpmm-arbitrage'
import { noFees, getFeeTotal } from './fees'
import {
  getFixedCancelPayouts,
  getIndependentMultiYesNoPayouts,
  getMultiFixedPayouts,
} from './payouts-fixed'
import { ContractMetric } from './contract-metric'
import { LiquidityProvision } from './liquidity-provision'

// --- creation pools (replicated from new-contract.ts so the test is self-contained) --------
function sumToOnePools(q: number[], ante: number) {
  const n = q.length
  if (n < 2) return q.map((qi) => ({ poolYes: ante, poolNo: ante, p: qi }))
  const sqrtC = q.map((qi) => Math.sqrt(qi * (1 - qi)))
  const meanSqrtC = sqrtC.reduce((s, x) => s + x, 0) / n
  const D0 = (ante * (n - 2)) / (2 * (n - 1))
  const Wbar = (ante * n) / (4 * (n - 1))
  const N = q.map((qi, i) => {
    const Wi = (Wbar * sqrtC[i]) / meanSqrtC
    const b = D0 - Wi
    return (-b + Math.sqrt(b * b + 4 * Wi * qi * D0)) / 2
  })
  const D = ante - N.reduce((s, x) => s + x, 0)
  return q.map((qi, i) => {
    const poolNo = N[i]
    const poolYes = poolNo + D
    const p = (qi * poolYes) / (qi * poolYes + (1 - qi) * poolNo)
    return { poolYes, poolNo, p }
  })
}

function setPools(q: number[], ante: number) {
  const L = ante / q.length
  return q.map((qi) => ({ poolYes: L, poolNo: L, p: qi })) // balanced => prob = p = q
}

type Cfg = {
  n: number
  probs: 'balanced' | 'skewed' | 'extreme'
  type: 'mc_sumone' | 'set_indep'
}

const PROB_SETS: Record<string, Record<number, number[]>> = {
  balanced: { 2: [0.5, 0.5], 3: [1 / 3, 1 / 3, 1 / 3], 5: Array(5).fill(0.2) },
  skewed: { 2: [0.7, 0.3], 3: [0.55, 0.3, 0.15], 5: [0.4, 0.25, 0.18, 0.1, 0.07] },
  extreme: { 2: [0.92, 0.08], 3: [0.85, 0.1, 0.05], 5: [0.8, 0.1, 0.05, 0.03, 0.02] },
}

// --- the conservation harness ---------------------------------------------------------------
class Sim {
  answers: Answer[]
  type: Cfg['type']
  ante: number
  balances: Record<string, number> = {}
  fees = 0
  liquidities: LiquidityProvision[] = []
  // trader positions: key `${user}|${answerId}` -> {YES, NO, invested, sold}
  pos = new Map<string, { YES: number; NO: number; invested: number; sold: number }>()
  // resting limit orders (makers). Threaded into every calc; the `makers` the calc returns
  // are applied to maker users here. Makers are NOT balance-capped — vendor's own multi-bet/
  // sell simulation assumes infinite maker balance (sell-shares.ts), and computeFills skips
  // the cap when balanceByUserId lacks the user, so we pass {} for balances and the real
  // unfilled book here.
  unfilled: LimitBet[] = []
  private lpId = 0
  private limitId = 0

  constructor(cfg: Cfg, creator = 'creator', ante = 1000) {
    this.type = cfg.type
    this.ante = ante
    const q =
      cfg.type === 'mc_sumone'
        ? normalize(PROB_SETS[cfg.probs][cfg.n])
        : PROB_SETS[cfg.probs][cfg.n]
    const pools = cfg.type === 'mc_sumone' ? sumToOnePools(q, ante) : setPools(q, ante)
    this.answers = pools.map((pl, i) => mkAnswer(i, pl.poolYes, pl.poolNo, pl.p))
    this.spend(creator, ante)
    this.liquidities.push({
      id: `lp${this.lpId++}`,
      userId: creator,
      contractId: 'c',
      createdTime: 0,
      isAnte: true,
      amount: ante,
    })
    this.check('create')
  }

  private spend(user: string, amount: number) {
    this.balances[user] = (this.balances[user] ?? 0) - amount
  }
  private credit(user: string, amount: number) {
    this.balances[user] = (this.balances[user] ?? 0) + amount
  }
  private posOf(user: string, answerId: string) {
    const k = `${user}|${answerId}`
    if (!this.pos.has(k)) this.pos.set(k, { YES: 0, NO: 0, invested: 0, sold: 0 })
    return this.pos.get(k)!
  }

  // Place a resting limit order (maker). Returns the LimitBet so tests can inspect whether it
  // interacted (bet.amount stays 0 and !isCancelled => untouched).
  placeLimit(
    user: string,
    answerIndex: number,
    outcome: 'YES' | 'NO',
    limitProb: number,
    orderAmount: number
  ): LimitBet {
    const a = this.answers[answerIndex]
    const bet: LimitBet = {
      id: `L${this.limitId++}`,
      userId: user,
      contractId: 'c',
      answerId: a.id,
      createdTime: this.limitId,
      amount: 0,
      loanAmount: 0,
      outcome,
      shares: 0,
      probBefore: a.prob,
      probAfter: a.prob,
      fees: noFees,
      isRedemption: false,
      orderAmount,
      limitProb,
      isFilled: false,
      isCancelled: false,
      fills: [],
    } as LimitBet
    this.unfilled.push(bet)
    return bet
  }

  // Apply the maker fills a calc produced: the maker pays `amount`, gains `shares` of their
  // outcome, and the resting order's filled amount accumulates on the book. This is the maker
  // side of conservation — it MUST be counted or `Sum deltas + fees` will not close.
  private applyMakers(
    makers: { bet: LimitBet; amount: number; shares: number }[],
    ordersToCancel: LimitBet[] = []
  ) {
    for (const m of makers) {
      const book = this.unfilled.find((b) => b.id === m.bet.id)
      if (!book) continue
      this.spend(m.bet.userId, m.amount) // maker pays mana
      this.posOf(m.bet.userId, m.bet.answerId!)[m.bet.outcome as 'YES' | 'NO'] += m.shares
      book.amount += m.amount
      book.shares += m.shares
      book.fills.push({ matchedBetId: null, amount: m.amount, shares: m.shares, timestamp: 0 })
      if (Math.abs(book.amount) >= book.orderAmount - 1e-6) book.isFilled = true
    }
    for (const o of ordersToCancel) {
      const book = this.unfilled.find((b) => b.id === o.id)
      if (book) book.isCancelled = true
    }
    // a filled / cancelled order leaves the book (no further fills).
    this.unfilled = this.unfilled.filter((b) => !b.isFilled && !b.isCancelled)
  }

  // apply a bet result (newBetResult-style: {answer, takers}) for `outcome` to user state
  private applyResult(
    user: string,
    r: { answer: Answer; takers: { amount: number; shares: number }[] },
    outcome: 'YES' | 'NO'
  ) {
    const p = this.posOf(user, r.answer.id)
    const amt = sumBy(r.takers, (t) => t.amount)
    const sh = sumBy(r.takers, (t) => t.shares)
    p[outcome] += sh
    if (amt >= 0) p.invested += amt
    else p.sold += -amt
    this.spend(user, amt) // negative amt (redemption/sell) credits back
  }

  buy(user: string, answerIndex: number, outcome: 'YES' | 'NO', amount: number) {
    if (this.type === 'set_indep') {
      // an independent answer is its own binary CPMM — single trade, NO cross-answer arb.
      const a = this.answers[answerIndex]
      const { shares, newPool, newP } = calculateCpmmPurchase(
        { pool: { YES: a.poolYes, NO: a.poolNo }, p: a.p, collectedFees: noFees },
        amount,
        outcome,
        true
      )
      this.answers = this.answers.map((x, i) =>
        i === answerIndex
          ? { ...x, poolYes: newPool.YES, poolNo: newPool.NO, p: newP,
              prob: getCpmmProbability(newPool, newP) }
          : x
      )
      const p = this.posOf(user, a.id)
      p[outcome] += shares
      p.invested += amount
      this.spend(user, amount)
      this.check(`set buy ${outcome} a${answerIndex} M$${amount} by ${user}`)
      return
    }
    const res = calculateCpmmMultiArbitrageBet(
      this.answers,
      this.answers[answerIndex],
      outcome,
      amount,
      undefined,
      this.unfilled,
      {},
      noFees
    )
    // single-bet path returns no updatedAnswers — rebuild pools from each leg's cpmmState.
    const poolById = new Map<string, { [o: string]: number }>()
    poolById.set(res.newBetResult.answer.id, res.newBetResult.cpmmState.pool)
    for (const o of res.otherBetResults) poolById.set(o.answer.id, o.cpmmState.pool)
    this.answers = this.answers.map((a) => {
      const pl = poolById.get(a.id)
      return pl
        ? { ...a, poolYes: pl.YES, poolNo: pl.NO, prob: getCpmmProbability(pl as any, a.p) }
        : a
    })
    // newBetResult is the traded answer (`outcome`); otherBetResults are the arbed legs.
    this.applyResult(user, res.newBetResult as any, outcome)
    for (const o of res.otherBetResults)
      this.applyResult(user, o as any, outcome === 'YES' ? 'NO' : 'YES')
    this.applyMakers(
      [res.newBetResult, ...res.otherBetResults].flatMap((r: any) => r.makers ?? []),
      [res.newBetResult, ...res.otherBetResults].flatMap((r: any) => r.ordersToCancel ?? [])
    )
    this.fees += getFeeTotal(res.newBetResult.totalFees)
    this.check(`buy ${outcome} a${answerIndex} M$${amount} by ${user}`)
  }

  multibet(user: string, basketIdx: number[], amount: number) {
    const res = calculateCpmmMultiArbitrageYesBets(
      this.answers,
      basketIdx.map((i) => this.answers[i]),
      amount,
      undefined,
      this.unfilled,
      {},
      noFees,
      'cpmm-multi-2'
    )
    this.answers = res.updatedAnswers as Answer[]
    for (const r of res.newBetResults) this.applyResult(user, r as any, 'YES')
    for (const r of res.otherBetResults) this.applyResult(user, r as any, 'NO')
    this.applyMakers(
      [...res.newBetResults, ...res.otherBetResults].flatMap((r: any) => r.makers ?? []),
      [...res.newBetResults, ...res.otherBetResults].flatMap((r: any) => r.ordersToCancel ?? [])
    )
    this.check(`multibet {${basketIdx}} M$${amount} by ${user}`)
  }

  // Sell `shares` of `outcome` that `user` holds on answer `answerIndex`.
  // Drives the REAL vendor sale calc (calculateCpmmSale for Set, the sum-to-one arb sale
  // otherwise). Conservation model, verified against vendor (calculate-cpmm-arbitrage.ts
  // calculateCpmmMultiArbitrageSellYes/No):
  //   - the seller's position in the sold answer drops by `shares`;
  //   - the seller's balance rises by `saleValue`;
  //   - every answer's pool moves to the calc's final state.
  // The cross-answer arb legs (otherBetResults) each get a redemption fill that EXACTLY
  // cancels their arb buy (net amount 0, net shares 0), so they move pools only — the seller
  // gains no other-answer position, and the cost of moving those pools is already folded into
  // `saleValue` via the sold answer's arb taker. (Self-checked: dropping any of the three
  // updates, or the otherBetResults pool moves, breaks the conservation oracle below.)
  sell(user: string, answerIndex: number, outcome: 'YES' | 'NO', shares: number) {
    const answerToSell = this.answers[answerIndex]
    if (this.type === 'set_indep') {
      const { cpmmState, saleValue, fees, makers } = calculateCpmmSale(
        {
          pool: { YES: answerToSell.poolYes, NO: answerToSell.poolNo },
          p: answerToSell.p,
          collectedFees: noFees,
        },
        shares,
        outcome,
        this.unfilled.filter((b) => b.answerId === answerToSell.id),
        {}
      )
      this.answers = this.answers.map((x, i) =>
        i === answerIndex
          ? { ...x, poolYes: cpmmState.pool.YES, poolNo: cpmmState.pool.NO, p: cpmmState.p,
              prob: getCpmmProbability(cpmmState.pool, cpmmState.p) }
          : x
      )
      const p = this.posOf(user, answerToSell.id)
      p[outcome] -= shares
      p.sold += saleValue
      this.credit(user, saleValue)
      this.applyMakers((makers as any) ?? [])
      this.fees += getFeeTotal(fees)
      this.check(`set sell ${outcome} ${shares}sh a${answerIndex} by ${user}`)
      return
    }
    const { saleValue, newBetResult, otherBetResults } = calculateCpmmMultiSumsToOneSale(
      this.answers,
      answerToSell,
      shares,
      outcome,
      undefined,
      this.unfilled,
      {},
      noFees
    )
    // sold answer pool by known id (newBetResult carries no `answer`); arb legs by their id.
    const poolById = new Map<string, { [o: string]: number }>()
    poolById.set(answerToSell.id, newBetResult.cpmmState.pool)
    for (const o of otherBetResults) poolById.set(o.answer.id, o.cpmmState.pool)
    this.answers = this.answers.map((a) => {
      const pl = poolById.get(a.id)
      return pl
        ? { ...a, poolYes: pl.YES, poolNo: pl.NO, prob: getCpmmProbability(pl as any, a.p) }
        : a
    })
    const pos = this.posOf(user, answerToSell.id)
    pos[outcome] -= shares
    pos.sold += saleValue
    this.credit(user, saleValue)
    this.applyMakers(
      [newBetResult, ...otherBetResults].flatMap((r: any) => r.makers ?? []),
      [newBetResult, ...otherBetResults].flatMap((r: any) => r.ordersToCancel ?? [])
    )
    this.fees +=
      getFeeTotal(newBetResult.totalFees) +
      sumBy(otherBetResults, (r) => getFeeTotal(r.totalFees))
    this.check(`sell ${outcome} ${shares}sh a${answerIndex} by ${user}`)
  }

  // current YES/NO shares a user holds on an answer (for "sell what you bought").
  sharesOf(user: string, answerIndex: number, outcome: 'YES' | 'NO') {
    return this.posOf(user, this.answers[answerIndex].id)[outcome]
  }

  // Add liquidity. With `answerIndex` set, subsidize a SINGLE answer (its own binary CPMM) via
  // the same lossless float-p deepen the per-answer drizzle (drizzleAnswer) realizes — this is
  // the `liq_target=single_outcome` covering-array case. Without it, whole-market (every answer).
  // Both model the add as the deepen the drizzle eventually applies, so the mana sits in pools and
  // is read by getMultiLiquidityPoolPayouts at resolution.
  addLiquidity(user: string, amount: number, answerIndex?: number) {
    if (answerIndex !== undefined) {
      const a = this.answers[answerIndex]
      const { newPool, newP } = addCpmmLiquidity({ YES: a.poolYes, NO: a.poolNo }, a.p, amount)
      this.answers = this.answers.map((x, i) =>
        i === answerIndex
          ? { ...x, poolYes: newPool.YES, poolNo: newPool.NO, p: newP,
              prob: getCpmmProbability(newPool, newP) }
          : x
      )
      this.spend(user, amount)
      this.liquidities.push({
        id: `lp${this.lpId++}`,
        userId: user,
        contractId: 'c',
        createdTime: this.lpId,
        amount,
        answerId: a.id,
      })
      this.check(`per-answer addLiquidity a${answerIndex} M$${amount} by ${user}`)
      return
    }
    const map = Object.fromEntries(
      this.answers.map((a) => [a.id, { pool: { YES: a.poolYes, NO: a.poolNo }, p: a.p }])
    )
    const updated =
      this.type === 'mc_sumone'
        ? addCpmmMultiLiquidityAnswersSumToOneV2(map, amount)
        : addCpmmMultiLiquidityToAnswersIndependentlyV2(map, amount)
    this.answers = this.answers.map((a) => {
      const u = updated[a.id]
      return { ...a, poolYes: u.pool.YES, poolNo: u.pool.NO, p: u.p, prob: getCpmmProbability(u.pool, u.p) }
    })
    this.spend(user, amount)
    this.liquidities.push({
      id: `lp${this.lpId++}`,
      userId: user,
      contractId: 'c',
      createdTime: this.lpId,
      amount,
    })
    this.check(`addLiquidity M$${amount} by ${user}`)
  }

  private metrics(): ContractMetric[] {
    const out: ContractMetric[] = []
    for (const [k, v] of this.pos) {
      const [userId, answerId] = k.split('|')
      out.push({
        userId,
        answerId,
        totalShares: { YES: v.YES, NO: v.NO },
        totalAmountInvested: v.invested,
        totalAmountSold: v.sold,
      } as any)
    }
    return out
  }

  // resolve and assert global conservation
  resolve(
    mode: 'one' | 'multiple' | 'cancel' | 'set_yesno',
    arg?: { winner?: number; split?: [number, number]; setOutcomes?: ('YES' | 'NO')[] }
  ) {
    const ms = this.metrics()
    let traderPayouts: { userId: string; payout: number }[] = []
    let liquidityPayouts: { userId: string; payout: number }[] = []
    if (mode === 'cancel') {
      ;({ traderPayouts, liquidityPayouts } = getFixedCancelPayouts(ms, this.liquidities))
    } else if (mode === 'set_yesno') {
      const outs = arg!.setOutcomes!
      this.answers.forEach((a, i) => {
        const r = getIndependentMultiYesNoPayouts(a, outs[i], ms, this.liquidities, 0)
        traderPayouts.push(...r.traderPayouts)
        liquidityPayouts.push(...r.liquidityPayouts)
      })
    } else {
      const resolutions: Record<string, number> =
        mode === 'one'
          ? { [this.answers[arg!.winner!].id]: 1 }
          : {
              [this.answers[0].id]: arg!.split![0],
              [this.answers[1].id]: arg!.split![1],
            }
      ;({ traderPayouts, liquidityPayouts } = getMultiFixedPayouts(
        this.answers,
        resolutions,
        ms,
        this.liquidities,
        0
      ))
    }
    for (const { userId, payout } of [...traderPayouts, ...liquidityPayouts])
      this.credit(userId, payout)
    const netSum = Object.values(this.balances).reduce((s, x) => s + x, 0)
    // Sum of all user balance deltas + fees must be exactly 0.
    expect(netSum + this.fees).toBeCloseTo(0, 4)
  }

  private check(step: string) {
    for (const a of this.answers) {
      const pr = getCpmmProbability({ YES: a.poolYes, NO: a.poolNo }, a.p)
      expect(pr).toBeGreaterThan(0)
      expect(pr).toBeLessThan(1)
    }
    if (this.type === 'mc_sumone') {
      const s = sumBy(this.answers, (a) =>
        getCpmmProbability({ YES: a.poolYes, NO: a.poolNo }, a.p)
      )
      expect(s).toBeCloseTo(1, 4)
    }
  }
}

function normalize(q: number[]) {
  const s = q.reduce((a, b) => a + b, 0)
  return q.map((x) => x / s)
}
function mkAnswer(i: number, poolYes: number, poolNo: number, p: number): Answer {
  return {
    id: `a${i}`,
    contractId: 'c',
    userId: 'creator',
    text: `A${i}`,
    createdTime: 0,
    index: i,
    poolYes,
    poolNo,
    p,
    prob: getCpmmProbability({ YES: poolYes, NO: poolNo }, p),
    totalLiquidity: 0,
    subsidyPool: 0,
    probChanges: { day: 0, week: 0, month: 0 },
    volume: 0,
  } as Answer
}

// --- the grid ------------------------------------------------------------------------------
describe('cpmm-multi-2 conservation grid (calc-layer rows)', () => {
  it('sum-to-one: create -> single buy -> resolve CHOOSE_ONE (winner classes)', () => {
    for (const probs of ['balanced', 'skewed', 'extreme'] as const)
      for (const n of [2, 3, 5]) {
        const s = new Sim({ n, probs, type: 'mc_sumone' })
        s.buy('alice', 1 % n, 'YES', 50)
        s.resolve('one', { winner: 1 % n }) // resolve to the traded answer
        const s2 = new Sim({ n, probs, type: 'mc_sumone' })
        s2.buy('alice', 0, 'YES', 40)
        s2.resolve('one', { winner: n - 1 }) // resolve to an untouched answer
      }
  })

  it('sum-to-one: multibet basket (m>=2) -> resolve to a basket answer (the m>1 bug locus)', () => {
    for (const probs of ['balanced', 'skewed', 'extreme'] as const)
      for (const n of [3, 5]) {
        const s = new Sim({ n, probs, type: 'mc_sumone' })
        s.multibet('alice', [1, 2], 150)
        s.resolve('one', { winner: 1 }) // basket member wins
      }
  })

  it('sum-to-one: multi-user (creator/alice/bob) + add-liquidity -> CHOOSE_ONE / MULTIPLE', () => {
    const s = new Sim({ n: 5, probs: 'skewed', type: 'mc_sumone' })
    s.buy('alice', 0, 'YES', 60)
    s.addLiquidity('bob', 300)
    s.buy('alice', 2, 'NO', 30)
    s.resolve('one', { winner: 0 })

    const s2 = new Sim({ n: 5, probs: 'skewed', type: 'mc_sumone' })
    s2.multibet('alice', [0, 1, 2], 90)
    s2.addLiquidity('bob', 200)
    s2.resolve('multiple', { split: [0.6, 0.4] })
  })

  it('sum-to-one: CANCEL after trades + add-liquidity refunds exactly', () => {
    const s = new Sim({ n: 3, probs: 'skewed', type: 'mc_sumone' })
    s.buy('alice', 0, 'YES', 50)
    s.buy('bob', 1, 'NO', 40)
    s.addLiquidity('carol', 100)
    s.resolve('cancel')
  })

  // --- sell rows (covering array: trade=sell — rows 4,10,11,16,21; limits/single-outcome
  //     liquidity aspects deferred to their own increments) -----------------------------------
  it('sum-to-one: buy then sell-all round-trips pools to creation (+ conservation on resolve)', () => {
    for (const probs of ['balanced', 'skewed', 'extreme'] as const)
      for (const n of [2, 3, 5]) {
        const s = new Sim({ n, probs, type: 'mc_sumone' })
        const before = s.answers.map((a) => ({ y: a.poolYes, no: a.poolNo }))
        s.buy('alice', 0, 'YES', 60)
        const held = s.sharesOf('alice', 0, 'YES')
        s.sell('alice', 0, 'YES', held) // sell everything back
        // round-trip: pools return to creation (the AMM is path-reversible for a lone trader)
        s.answers.forEach((a, i) => {
          expect(a.poolYes).toBeCloseTo(before[i].y, 4)
          expect(a.poolNo).toBeCloseTo(before[i].no, 4)
        })
        s.resolve('one', { winner: 0 })
      }
  })

  it('sum-to-one: buy then PARTIAL sell -> resolve (traded / untouched / multiple)', () => {
    for (const probs of ['balanced', 'skewed', 'extreme'] as const)
      for (const n of [2, 3, 5]) {
        const a = new Sim({ n, probs, type: 'mc_sumone' })
        a.buy('alice', 0, 'YES', 80)
        a.sell('alice', 0, 'YES', a.sharesOf('alice', 0, 'YES') / 2)
        a.resolve('one', { winner: 0 }) // resolve to the (still partly-held) traded answer

        const b = new Sim({ n, probs, type: 'mc_sumone' })
        b.buy('alice', 0, 'YES', 80)
        b.sell('alice', 0, 'YES', b.sharesOf('alice', 0, 'YES') / 2)
        b.resolve('one', { winner: n - 1 }) // resolve to an untouched answer

        const c = new Sim({ n, probs, type: 'mc_sumone' })
        c.buy('alice', 1 % n, 'YES', 70)
        c.sell('alice', 1 % n, 'YES', c.sharesOf('alice', 1 % n, 'YES') * 0.4)
        c.resolve('multiple', { split: [0.6, 0.4] })
      }
  })

  it('sum-to-one: multi-user sell + add-liquidity -> CHOOSE_ONE conservation (row 16 shape)', () => {
    const s = new Sim({ n: 5, probs: 'balanced', type: 'mc_sumone' })
    s.buy('alice', 0, 'YES', 60)
    s.buy('bob', 2, 'NO', 40)
    s.sell('alice', 0, 'YES', s.sharesOf('alice', 0, 'YES') * 0.5)
    s.addLiquidity('carol', 200)
    s.resolve('one', { winner: 0 })
  })

  it('Set (independent): buy then sell (full + partial) -> per-answer resolution', () => {
    for (const probs of ['skewed', 'extreme'] as const)
      for (const n of [2, 3]) {
        const s = new Sim({ n, probs, type: 'set_indep' })
        const before = s.answers.map((a) => ({ y: a.poolYes, no: a.poolNo }))
        s.buy('alice', 0, 'YES', 40)
        s.sell('alice', 0, 'YES', s.sharesOf('alice', 0, 'YES')) // round-trip answer 0
        expect(s.answers[0].poolYes).toBeCloseTo(before[0].y, 4)
        expect(s.answers[0].poolNo).toBeCloseTo(before[0].no, 4)
        if (n > 2) {
          s.buy('bob', 1, 'NO', 25)
          s.sell('bob', 1, 'NO', s.sharesOf('bob', 1, 'NO') * 0.5) // partial
        }
        const outs = Array.from({ length: n }, (_, i) =>
          i % 2 === 0 ? 'YES' : 'NO'
        ) as ('YES' | 'NO')[]
        s.resolve('set_yesno', { setOutcomes: outs })
      }
  })

  it('Set (independent): create -> buys -> add-liquidity -> per-answer resolution', () => {
    for (const probs of ['skewed', 'extreme'] as const)
      for (const n of [2, 3]) {
        const s = new Sim({ n, probs, type: 'set_indep' })
        s.buy('alice', 0, 'YES', 40)
        if (n > 2) s.buy('bob', 1, 'NO', 25)
        s.addLiquidity('carol', 150)
        const outs = Array.from({ length: n }, (_, i) =>
          i % 2 === 0 ? 'YES' : 'NO'
        ) as ('YES' | 'NO')[]
        s.resolve('set_yesno', { setOutcomes: outs })
      }
  })

  // --- per-answer add-liquidity (covering array: liq_target=single_outcome) -------------------
  it('sum-to-one: per-answer add-liquidity -> trade -> resolve (traded / subsidized answer)', () => {
    for (const probs of ['balanced', 'skewed', 'extreme'] as const)
      for (const n of [2, 3, 5]) {
        const s = new Sim({ n, probs, type: 'mc_sumone' })
        s.buy('alice', 0, 'YES', 50)
        s.addLiquidity('bob', 150, 1 % n) // subsidize a SINGLE answer
        s.buy('alice', 1 % n, 'NO', 30)
        s.resolve('one', { winner: 0 })

        const s2 = new Sim({ n, probs, type: 'mc_sumone' })
        s2.addLiquidity('carol', 120, n - 1) // subsidize the last answer...
        s2.resolve('one', { winner: n - 1 }) // ...and resolve to it
      }
  })

  it('sum-to-one: per-answer add on multiple answers + MULTIPLE / CANCEL resolve', () => {
    const s = new Sim({ n: 5, probs: 'skewed', type: 'mc_sumone' })
    s.addLiquidity('bob', 100, 0)
    s.addLiquidity('carol', 80, 2)
    s.multibet('alice', [0, 1], 120)
    s.resolve('multiple', { split: [0.6, 0.4] })

    const s2 = new Sim({ n: 3, probs: 'skewed', type: 'mc_sumone' })
    s2.addLiquidity('bob', 90, 1)
    s2.buy('alice', 0, 'YES', 40)
    s2.resolve('cancel')
  })

  it('Set (independent): per-answer add-liquidity -> per-answer resolution', () => {
    for (const n of [2, 3]) {
      const s = new Sim({ n, probs: 'extreme', type: 'set_indep' })
      s.buy('alice', 0, 'YES', 40)
      s.addLiquidity('bob', 100, 0)
      if (n > 2) s.addLiquidity('carol', 60, 2)
      const outs = Array.from({ length: n }, (_, i) =>
        i % 2 === 0 ? 'YES' : 'NO'
      ) as ('YES' | 'NO')[]
      s.resolve('set_yesno', { setOutcomes: outs })
    }
  })
})

// --- LIMIT ORDERS (covering array: limits != none) -------------------------------------------
// Master invariant (Evan, 2026-06-28): with resting limit orders, a limit STRICTLY outside
// (initial, final) on its answer must NOT interact — the maker gets no shares and the order's
// size on the book is unchanged. Resting orders are always on their far side (a NO maker rests
// ABOVE current prob and fills only when price rises to it; a YES maker rests BELOW), so
// "strictly outside (initial, final)" means the price excursion never reached it.
//
// This is also the acceptance test for v2's NON-OVERSHOOTING auto-arb vs. the §8 reversibility
// caveat (docs/amm-invariants.md): v1 multibet could overshoot a limit at the peak and not
// unwind it, so a limit past `final` still got consumed. If v2's "Approach C" solve leaves
// just-past-final limits untouched even on a basket multibet, v2 killed that bug at the calc
// layer. The grid adjudicates — it is NOT assumed.
//
// `Sum(all balance deltas) + fees == 0` must still close across taker + ALL makers + creator.
const CAP_HI = 0.97
const CAP_LO = 0.03
// a validly-resting maker is strictly outside its answer's band iff price never reached it.
const strictlyOutside = (
  bet: { outcome: string; limitProb: number },
  lo: number,
  hi: number
) =>
  bet.outcome === 'NO' ? bet.limitProb > hi + 1e-9 : bet.limitProb < lo - 1e-9

const assertOutsideUntouched = (
  s: Sim,
  placed: { bet: LimitBet; ai: number }[],
  init: number[]
) => {
  const final = s.answers.map((a) => a.prob)
  let checked = 0
  for (const { bet, ai } of placed) {
    const lo = Math.min(init[ai], final[ai])
    const hi = Math.max(init[ai], final[ai])
    if (strictlyOutside(bet, lo, hi)) {
      expect(bet.amount).toBeCloseTo(0, 6) // no fill => shares & book size unchanged
      expect(bet.isCancelled).toBe(false)
      checked++
    }
  }
  return checked
}

describe('cpmm-multi-2 conservation grid — limit orders', () => {
  it('a crossed maker IS filled and IS counted in conservation (buy & sell)', () => {
    for (const n of [2, 3, 5]) {
      // buy crosses a NO maker resting just above answer-0's current prob
      const s = new Sim({ n, probs: 'skewed', type: 'mc_sumone' })
      const mkBuy = s.placeLimit('mk', 0, 'NO', Math.min(s.answers[0].prob + 0.02, CAP_HI), 300)
      s.buy('alice', 0, 'YES', 200)
      expect(mkBuy.amount).toBeGreaterThan(0) // positive control: it interacted
      s.resolve('one', { winner: 0 }) // conservation across alice + mk + creator

      // sell crosses a YES maker resting just below answer-0's current prob
      const s2 = new Sim({ n, probs: 'skewed', type: 'mc_sumone' })
      s2.buy('alice', 0, 'YES', 250) // give alice a position to sell
      const mkSell = s2.placeLimit('mk', 0, 'YES', Math.max(s2.answers[0].prob - 0.02, CAP_LO), 300)
      s2.sell('alice', 0, 'YES', s2.sharesOf('alice', 0, 'YES'))
      expect(mkSell.amount).toBeGreaterThan(0)
      s2.resolve('one', { winner: 0 })
    }
  })

  it('INVARIANT: out-of-band resting limits never interact — buy (+ in-band positive control)', () => {
    for (const probs of ['balanced', 'skewed'] as const)
      for (const n of [2, 3, 5]) {
        const s = new Sim({ n, probs, type: 'mc_sumone' })
        const init = s.answers.map((a) => a.prob)
        // far-out NO makers on every answer (above hi) + far-out YES makers (below lo): a single
        // bounded buy on answer 0 reaches none of them.
        const placed = s.answers.flatMap((_, ai) => [
          { bet: s.placeLimit('mk', ai, 'NO', CAP_HI, 100), ai },
          { bet: s.placeLimit('mk', ai, 'YES', CAP_LO, 100), ai },
        ])
        // in-band positive control on answer 0 (just above init0): must be touched.
        const control = s.placeLimit('mk', 0, 'NO', Math.min(init[0] + 0.02, CAP_HI), 80)
        s.buy('alice', 0, 'YES', 120)
        const checked = assertOutsideUntouched(s, placed, init)
        expect(checked).toBeGreaterThan(0) // not vacuous
        expect(control.amount).toBeGreaterThan(0) // the matcher DOES fire in-band
        s.resolve('one', { winner: 0 })
      }
  })

  it('INVARIANT: out-of-band resting limits never interact — sell', () => {
    for (const probs of ['balanced', 'skewed'] as const)
      for (const n of [2, 3, 5]) {
        const s = new Sim({ n, probs, type: 'mc_sumone' })
        s.buy('alice', 0, 'YES', 200) // position to sell
        const init = s.answers.map((a) => a.prob)
        const placed = s.answers.flatMap((_, ai) => [
          { bet: s.placeLimit('mk', ai, 'NO', CAP_HI, 100), ai },
          { bet: s.placeLimit('mk', ai, 'YES', CAP_LO, 100), ai },
        ])
        s.sell('alice', 0, 'YES', s.sharesOf('alice', 0, 'YES') * 0.6)
        const checked = assertOutsideUntouched(s, placed, init)
        expect(checked).toBeGreaterThan(0)
        s.resolve('multiple', { split: [0.6, 0.4] })
      }
  })

  it('INVARIANT/§8 prize: v2 basket multibet does NOT overshoot a limit just past final', () => {
    for (const n of [3, 5]) {
      // baseline: where does the basket buy on [0,1] land each answer (no makers present)?
      const base = new Sim({ n, probs: 'skewed', type: 'mc_sumone' })
      base.multibet('alice', [0, 1], 160)
      const finals = base.answers.map((a) => a.prob)
      // re-run with a NO maker just past final on each UP-moved (bought) answer, and a YES maker
      // just past final on each DOWN-moved (arbed) answer — each strictly outside its own band.
      const s = new Sim({ n, probs: 'skewed', type: 'mc_sumone' })
      const init = s.answers.map((a) => a.prob)
      const placed = s.answers.map((_, ai) => {
        const up = finals[ai] >= init[ai]
        return up
          ? { bet: s.placeLimit('mk', ai, 'NO', Math.min(finals[ai] + 0.01, CAP_HI), 200), ai }
          : { bet: s.placeLimit('mk', ai, 'YES', Math.max(finals[ai] - 0.01, CAP_LO), 200), ai }
      })
      s.multibet('alice', [0, 1], 160)
      // every just-past-final maker must be untouched => v2 did not overshoot.
      for (const { bet } of placed) {
        expect(bet.amount).toBeCloseTo(0, 6)
        expect(bet.isCancelled).toBe(false)
      }
      s.resolve('one', { winner: 0 })

      // independent positive control (own sim, so it can't perturb the run above): a maker
      // mid-band on answer 0 MUST be crossed by the same multibet — proves the trade reaches
      // into the band, so the untouched just-past-final result is a genuine no-overshoot.
      const pc = new Sim({ n, probs: 'skewed', type: 'mc_sumone' })
      const control = pc.placeLimit('mk', 0, 'NO', (init[0] + finals[0]) / 2, 50)
      pc.multibet('alice', [0, 1], 160)
      expect(control.amount).toBeGreaterThan(0)
      pc.resolve('one', { winner: 0 })
    }
  })

  // FALSIFICATION SWEEP: try hard to make a v2 trade touch an out-of-range limit. Place a maker
  // just past `final` (on the far, unreached side) at progressively TIGHTER margins, per answer,
  // one at a time (so an out-of-range maker can't perturb the run), across configs and across
  // buy / sell / basket-multibet. ANY fill is a v2 invariant violation. Margins go to 1e-4 to
  // catch numerical overshoot, not just the gross v1 transient band.
  const MARGINS = [0.02, 0.0001] // one gross (v1 transient band), one tight (numerical overshoot)
  // The invariant is per ATOMIC op: a limit outside THAT op's own (init,final) excursion must
  // not interact. So each measured op is a single monotonic call; any position the op needs is
  // built in a `setup` phase that runs BEFORE the maker is placed (and is not part of the range).
  // ANY fill at any margin (down to 1e-4, to catch numerical overshoot) is a v2 violation.
  it('FALSIFY: no v2 op (buy/sell/multibet) touches a limit outside its own range, any margin', () => {
    let probes = 0
    for (const probs of ['balanced', 'skewed', 'extreme'] as const)
      for (const n of [2, 3, 5]) {
        const cases: {
          label: string
          setup: (s: Sim) => void
          op: (s: Sim) => void
        }[] = [
          { label: 'buy', setup: () => {}, op: (s) => s.buy('alice', 0, 'YES', 90) },
          {
            label: 'sell',
            setup: (s) => s.buy('alice', 0, 'YES', 200), // build position FIRST, no maker yet
            op: (s) => s.sell('alice', 0, 'YES', s.sharesOf('alice', 0, 'YES') * 0.5),
          },
          // n=5 multibet overshoot is covered by the dedicated §8 prize test; keep the broad
          // sweep's multibet at n=3 to bound cost.
          ...(n === 3
            ? [{ label: 'multibet', setup: () => {}, op: (s: Sim) => s.multibet('alice', [0, 1], 140) }]
            : []),
        ]
        for (const c of cases) {
          // baseline: range of the measured op alone (after setup, before any maker).
          const base = new Sim({ n, probs, type: 'mc_sumone' })
          c.setup(base)
          const init = base.answers.map((a) => a.prob)
          c.op(base)
          const finals = base.answers.map((a) => a.prob)
          for (let ai = 0; ai < n; ai++) {
            const lo = Math.min(init[ai], finals[ai])
            const hi = Math.max(init[ai], finals[ai])
            for (const m of MARGINS) {
              // A valid resting maker outside the op's [lo,hi] excursion, BOTH sides:
              //   NO  maker above hi  (rests above current prob; price never rose to it)
              //   YES maker below lo  (rests below current prob; price never fell to it)
              const placements: { outcome: 'YES' | 'NO'; L: number }[] = []
              const noL = Math.min(hi + m, CAP_HI)
              if (noL > hi + 1e-9) placements.push({ outcome: 'NO', L: noL })
              const yesL = Math.max(lo - m, 0.011) // floor just above MIN_CPMM_PROB
              if (yesL < lo - 1e-9) placements.push({ outcome: 'YES', L: yesL })
              for (const pl of placements) {
                const s = new Sim({ n, probs, type: 'mc_sumone' })
                c.setup(s) // identical position build, still no maker
                const bet = s.placeLimit('mk', ai, pl.outcome, pl.L, 300)
                c.op(s)
                if (Math.abs(bet.amount) > 1e-6 || bet.isCancelled) {
                  // eslint-disable-next-line no-console
                  console.log('VIOLATION', JSON.stringify({
                    probs, n, op: c.label, ai, m, outcome: pl.outcome,
                    init: +init[ai].toFixed(5), final: +finals[ai].toFixed(5),
                    lo: +lo.toFixed(5), hi: +hi.toFixed(5), L: +pl.L.toFixed(5),
                    fill: +bet.amount.toFixed(5), finalNow: +s.answers[ai].prob.toFixed(5),
                  }))
                }
                expect(bet.amount).toBeCloseTo(0, 6)
                expect(bet.isCancelled).toBe(false)
                probes++
              }
            }
          }
        }
      }
    expect(probes).toBeGreaterThan(50) // the sweep actually exercised many placements
  })

  it('NON-REVERSIBILITY: a buy that crosses a maker, then sell-all, does NOT return to creation', () => {
    for (const n of [2, 3]) {
      const s = new Sim({ n, probs: 'skewed', type: 'mc_sumone' })
      const before = s.answers.map((a) => ({ y: a.poolYes, no: a.poolNo }))
      const maker = s.placeLimit('mk', 0, 'NO', Math.min(s.answers[0].prob + 0.02, CAP_HI), 150)
      s.buy('alice', 0, 'YES', 200)
      expect(maker.amount).toBeGreaterThan(0) // a maker was permanently engaged
      s.sell('alice', 0, 'YES', s.sharesOf('alice', 0, 'YES')) // alice unwinds fully
      // pools do NOT return to creation: the maker now holds NO shares the AMM can't unwind.
      const moved = s.answers.some(
        (a, i) =>
          Math.abs(a.poolYes - before[i].y) > 1e-3 ||
          Math.abs(a.poolNo - before[i].no) > 1e-3
      )
      expect(moved).toBe(true)
      // but global conservation STILL closes across alice + maker + creator.
      s.resolve('one', { winner: 0 })
    }
  })
})
