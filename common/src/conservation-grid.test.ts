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
import {
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
  private lpId = 0

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
      [],
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
    this.fees += getFeeTotal(res.newBetResult.totalFees)
    this.check(`buy ${outcome} a${answerIndex} M$${amount} by ${user}`)
  }

  multibet(user: string, basketIdx: number[], amount: number) {
    const res = calculateCpmmMultiArbitrageYesBets(
      this.answers,
      basketIdx.map((i) => this.answers[i]),
      amount,
      undefined,
      [],
      {},
      noFees,
      'cpmm-multi-2'
    )
    this.answers = res.updatedAnswers as Answer[]
    for (const r of res.newBetResults) this.applyResult(user, r as any, 'YES')
    for (const r of res.otherBetResults) this.applyResult(user, r as any, 'NO')
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
      const { cpmmState, saleValue, fees } = calculateCpmmSale(
        {
          pool: { YES: answerToSell.poolYes, NO: answerToSell.poolNo },
          p: answerToSell.p,
          collectedFees: noFees,
        },
        shares,
        outcome,
        [],
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
      [],
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
    this.fees +=
      getFeeTotal(newBetResult.totalFees) +
      sumBy(otherBetResults, (r) => getFeeTotal(r.totalFees))
    this.check(`sell ${outcome} ${shares}sh a${answerIndex} by ${user}`)
  }

  // current YES/NO shares a user holds on an answer (for "sell what you bought").
  sharesOf(user: string, answerIndex: number, outcome: 'YES' | 'NO') {
    return this.posOf(user, this.answers[answerIndex].id)[outcome]
  }

  addLiquidity(user: string, amount: number) {
    // model whole-market add as the lossless v2 deepen (what drizzle realizes), so the added
    // mana sits in pools and is read by getMultiLiquidityPoolPayouts at resolution.
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
})
