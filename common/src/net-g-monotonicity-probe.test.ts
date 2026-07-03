// Adversarial probe of the cpmm-multi-2 v2 basket solve's bisection premise.
//
// calculateCpmmMultiArbitrageBetsYesV2 (calculate-cpmm-arbitrage.ts ~330-555) bisects on g
// (equal YES shares per basket answer) assuming net(g) is strictly increasing. That is PROVEN
// only at p = 1/2 with no limit orders (GP12a). Production runs general per-answer p WITH
// resting limit orders. If net(g) plateaus or dips, binarySearch silently returns a wrong g
// and the taker is mis-charged (realized cost != betAmount) with no error.
//
// Probes:
//   0. Transcription validation: the internal evalG is transcribed here (with cited line
//      numbers); we re-run the outer solve on the transcription and require it to reproduce
//      the public calculateCpmmMultiArbitrageYesBets(arbVersion='cpmm-multi-2') output.
//   1. Dense net(g) sampling at general p with resting limits, across a config grid.
//   2. cost == betAmount invariant + sum-prob == 1 + pools > 0 via the public API,
//      including whale bets on an ante-1000-scale market.
//   3. Whale / feasibility-boundary behavior: residuals, bracket doublings, guard trips.
//   x. Adversarial extra: a maker whose balance binds ACROSS two non-basket answers
//      (the inner eta solve previews legs with per-leg balance copies but realizes them
//      with a shared decremented balance -> preview != realization is a candidate bug).
//
// Run:
//   cd /home/evand/predictions/vendor/manifold/common && \
//     PROBE=1 npx jest net-g-monotonicity-probe --silent=false
// Skipped (describe.skip) in normal test runs.

import { Dictionary, groupBy, mapValues, sumBy } from 'lodash'
import { Answer } from './answer'
import { LimitBet, maker } from './bet'
import {
  calculateAmountToBuySharesFixedP,
  computeFills,
  getCpmmProbability,
} from './calculate-cpmm'
import { calculateCpmmMultiArbitrageYesBets } from './calculate-cpmm-arbitrage'
import { Fees, noFees } from './fees'
import { binarySearch } from './util/algos'

// ---------------------------------------------------------------- fixtures
// (copied from calculate-cpmm-arbitrage.test.ts / cpmm-perf-bench.test.ts)

// p = 0.5 answer with pool product k = L^2 at the given prob
const getAnswer = (index: number, prob: number, L = 10): Answer => {
  const k = L * L
  const poolYes = Math.sqrt((k * (1 - prob)) / prob)
  const poolNo = k / poolYes
  return {
    id: `answer${index}`,
    contractId: `contract`,
    userId: `user${index}`,
    text: `Answer ${index}`,
    createdTime: 0,
    index,
    prob,
    poolYes,
    poolNo,
    p: 0.5,
    totalLiquidity: 0,
    subsidyPool: 0,
    probChanges: { day: 0, week: 0, month: 0 },
    volume: 0,
  } as Answer
}

// general-p answer: balanced pools (Y = N = L) so prob = p
const getAnswerWithP = (index: number, p: number, L = 100): Answer =>
  ({
    id: `answer${index}`,
    contractId: `contract`,
    userId: `user${index}`,
    text: `Answer ${index}`,
    createdTime: 0,
    index,
    prob: p,
    poolYes: L,
    poolNo: L,
    p,
    totalLiquidity: 0,
    subsidyPool: 0,
    probChanges: { day: 0, week: 0, month: 0 },
    volume: 0,
  } as Answer)

const getLimitBet = (
  id: string,
  answer: Answer,
  outcome: 'YES' | 'NO',
  userId: string,
  orderAmount: number,
  limitProb: number
): LimitBet => ({
  id,
  userId,
  contractId: answer.contractId,
  answerId: answer.id,
  createdTime: 0,
  amount: 0,
  loanAmount: 0,
  outcome,
  shares: 0,
  probBefore: answer.prob,
  probAfter: answer.prob,
  fees: noFees,
  isRedemption: false,
  orderAmount,
  limitProb,
  isFilled: false,
  isCancelled: false,
  fills: [],
})

// clone mutables so repeated calls see fresh state
const cloneBets = (bets: LimitBet[]) => bets.map((b) => ({ ...b, fills: [] }))

// ------------------------------------------------- transcribed internals
// applyMakersToWorkingState: transcribed from calculate-cpmm-arbitrage.ts lines 155-189
// (not exported from production; transcribed rather than modifying production code).
const applyMakersToWorkingStateT = (
  makers: maker[],
  ordersToCancel: LimitBet[],
  workingUnfilledBetsByAnswer: Dictionary<LimitBet[]>,
  workingBalanceByUserId: { [userId: string]: number }
) => {
  for (const maker of makers) {
    const { bet, amount, shares } = maker
    if (!bet.answerId) {
      throw new Error('Multi-bet has no answerId')
    }
    if (amount > 0) {
      const prev = workingBalanceByUserId[bet.userId]
      if (prev !== undefined) workingBalanceByUserId[bet.userId] = prev - amount
    }
    const arr = workingUnfilledBetsByAnswer[bet.answerId] ?? []
    const idx = arr.findIndex((b) => b.id === bet.id)
    if (idx >= 0) {
      const updated = { ...arr[idx] }
      updated.amount = (updated.amount ?? 0) + amount
      updated.shares = (updated.shares ?? 0) + shares
      arr[idx] = updated
      workingUnfilledBetsByAnswer[bet.answerId] = arr
    }
  }
  if (ordersToCancel.length) {
    const cancelIds = new Set(ordersToCancel.map((b) => b.id))
    for (const [answerId, arr] of Object.entries(workingUnfilledBetsByAnswer)) {
      workingUnfilledBetsByAnswer[answerId] = arr.filter(
        (b) => !cancelIds.has(b.id)
      )
    }
  }
}

// evalG + outer solve: transcribed from calculateCpmmMultiArbitrageBetsYesV2,
// calculate-cpmm-arbitrage.ts lines 339-491 (evalG body: lines 347-470; outer bracket
// doubling + bisection: lines 474-487). Verbatim logic; only instrumentation added.
const makeSolver = (
  initialAnswers: Answer[],
  initialAnswersToBuy: Answer[],
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  collectedFees: Fees = noFees
) => {
  const unfilledBetsByAnswer = groupBy(unfilledBets, (b) => b.answerId)
  const basketIds = new Set(initialAnswersToBuy.map((a) => a.id))
  const others = initialAnswers.filter((a) => !basketIds.has(a.id))
  const n = initialAnswers.length
  const m = initialAnswersToBuy.length

  // lines 347-470
  const evalG = (g: number) => {
    // line 349-352: fresh working snapshots per probe
    const workingUnfilledBetsByAnswer = mapValues(
      unfilledBetsByAnswer,
      (bets) => [...bets]
    )
    const workingBalanceByUserId = { ...balanceByUserId }

    // lines 354-385: basket YES legs, single rising sweep, limit-aware
    let basketCost = 0
    const yesBetResults = initialAnswersToBuy.map((answer) => {
      const pool = { YES: answer.poolYes, NO: answer.poolNo }
      const state = { pool, p: answer.p, collectedFees }
      const yesAmount = calculateAmountToBuySharesFixedP(
        state,
        g,
        'YES',
        workingUnfilledBetsByAnswer[answer.id] ?? [],
        workingBalanceByUserId
      )
      const result = {
        ...computeFills(
          state,
          'YES',
          yesAmount,
          limitProb,
          workingUnfilledBetsByAnswer[answer.id] ?? [],
          workingBalanceByUserId
        ),
        answer,
      }
      applyMakersToWorkingStateT(
        result.makers,
        result.ordersToCancel,
        workingUnfilledBetsByAnswer,
        workingBalanceByUserId
      )
      basketCost += sumBy(result.takers, 'amount')
      return result
    })
    // lines 386-392
    const basketSum = sumBy(yesBetResults, (r) =>
      getCpmmProbability(r.cpmmState.pool, r.cpmmState.p)
    )
    const target = 1 - basketSum
    if (target <= 1e-9) {
      return undefined
    }

    // lines 394-427: inner eta solve (read-only preview per eta)
    const othersSumAtEta = (eta: number) =>
      sumBy(others, (answer) => {
        const pool = { YES: answer.poolYes, NO: answer.poolNo }
        const state = { pool, p: answer.p, collectedFees }
        const noAmount = calculateAmountToBuySharesFixedP(
          state,
          eta,
          'NO',
          workingUnfilledBetsByAnswer[answer.id] ?? [],
          workingBalanceByUserId,
          true
        )
        const { cpmmState } = computeFills(
          state,
          'NO',
          noAmount,
          undefined,
          workingUnfilledBetsByAnswer[answer.id] ?? [],
          workingBalanceByUserId,
          undefined,
          true
        )
        return getCpmmProbability(cpmmState.pool, cpmmState.p)
      })

    let eta = 0
    let etaHi = 0
    if (othersSumAtEta(0) > target) {
      let hi = 1
      while (othersSumAtEta(hi) > target && hi < 1e12) hi *= 2
      etaHi = hi
      eta = binarySearch(0, hi, (e) => target - othersSumAtEta(e))
    }

    // lines 429-463: realize the OTHER NO legs, applying maker fills
    let othersCost = 0
    const noBetResults = others.map((answer) => {
      const pool = { YES: answer.poolYes, NO: answer.poolNo }
      const state = { pool, p: answer.p, collectedFees }
      const noAmount = calculateAmountToBuySharesFixedP(
        state,
        eta,
        'NO',
        workingUnfilledBetsByAnswer[answer.id] ?? [],
        workingBalanceByUserId,
        true
      )
      const result = {
        ...computeFills(
          state,
          'NO',
          noAmount,
          undefined,
          workingUnfilledBetsByAnswer[answer.id] ?? [],
          workingBalanceByUserId,
          undefined,
          true
        ),
        answer,
      }
      applyMakersToWorkingStateT(
        result.makers,
        result.ordersToCancel,
        workingUnfilledBetsByAnswer,
        workingBalanceByUserId
      )
      othersCost += sumBy(result.takers, 'amount')
      return result
    })

    // lines 465-469
    const net = basketCost + othersCost - eta * (n - m - 1)
    const realizedOthersSum = sumBy(noBetResults, (r) =>
      getCpmmProbability(r.cpmmState.pool, r.cpmmState.p)
    )
    return {
      yesBetResults,
      noBetResults,
      eta,
      etaHi,
      net,
      basketCost,
      othersCost,
      basketSum,
      target,
      realizedOthersSum,
      finalSumProb: basketSum + realizedOthersSum,
    }
  }

  // lines 474-487: outer bracket doubling + bisection (instrumented)
  const solve = (betAmount: number) => {
    let gHi = 1
    let doublings = 0
    while (true) {
      const r = evalG(gHi)
      if (!r || r.net >= betAmount) break
      gHi *= 2
      doublings++
      if (gHi > 1e9) {
        throw new Error('budget unreachable in cpmm-multi-2 YES basket solve')
      }
    }
    const g = binarySearch(0, gHi, (gg) => {
      const r = evalG(gg)
      return r ? r.net - betAmount : 1
    })
    return { g, gHi, doublings, solved: evalG(g) }
  }

  return { evalG, solve, n, m, others }
}

// ---------------------------------------------------------------- helpers

const publicV2 = (
  answers: Answer[],
  basket: Answer[],
  betAmount: number,
  unfilled: LimitBet[],
  balances: { [userId: string]: number }
) =>
  calculateCpmmMultiArbitrageYesBets(
    answers,
    basket,
    betAmount,
    undefined,
    cloneBets(unfilled),
    { ...balances },
    noFees,
    'cpmm-multi-2'
  )

type PublicResult = ReturnType<typeof publicV2>

const totalTakerAmount = (r: PublicResult) =>
  sumBy(r.newBetResults, (b) => sumBy(b.takers, 'amount')) +
  sumBy(r.otherBetResults, (b) => sumBy(b.takers, 'amount'))

const sumProbAfter = (r: PublicResult) => sumBy(r.updatedAnswers, 'prob')

const minPoolAfter = (r: PublicResult) =>
  Math.min(
    ...r.updatedAnswers.flatMap((a) => [a.poolYes, a.poolNo])
  )

const fmt = (x: number, d = 12) => x.toExponential(3).padStart(d)

// ---------------------------------------------------------------- config grid

type MakerCfg = 'none' | 'basket-pin' | 'other-side' | 'both'
type Shape = 'extreme' | 'moderate' | 'p05-control'

const PS: Record<Exclude<Shape, 'p05-control'>, number[]> = {
  extreme: [0.9, 0.05, 0.03, 0.02],
  moderate: [0.6, 0.2, 0.1, 0.1],
}

const mkAnswers = (shape: Shape, L = 100): Answer[] =>
  shape === 'p05-control'
    ? // p = 0.5 control with the same prob vector as 'extreme' (pools shaped, k = L^2)
      PS.extreme.map((prob, i) => getAnswer(i, prob, L))
    : PS[shape].map((p, i) => getAnswerWithP(i, p, L))

// (a) large NO limit ask ~0.02 above the (first) basket answer's initial prob: pins
//     the basket answer's price during the taker's rising YES sweep.
// (b) YES bid on the first non-basket answer ~0.02 below its prob: crossed as the
//     auto-arb NO sweep pushes that answer down.
// Order sizes chosen so both the pinned segment AND the order-exhaustion kink land
// inside probe 1's operational sweep (net <= ~1500): the pin (60 mana at ~0.92)
// exhausts around g ~ 750; the bid (20 mana at ~0.03) exhausts around eta ~ 650.
const mkMakers = (
  answers: Answer[],
  basketSize: number,
  cfg: MakerCfg,
  scale = 1
): LimitBet[] => {
  const bets: LimitBet[] = []
  if (cfg === 'basket-pin' || cfg === 'both') {
    const a = answers[0]
    bets.push(
      getLimitBet(
        'pinNO',
        a,
        'NO',
        'maker',
        60 * scale,
        Math.min(a.prob + 0.02, 0.98)
      )
    )
  }
  if (cfg === 'other-side' || cfg === 'both') {
    const a = answers[basketSize] // first non-basket answer
    bets.push(
      getLimitBet(
        'bidYES',
        a,
        'YES',
        'maker',
        20 * scale,
        Math.max(a.prob - 0.02, 0.011)
      )
    )
  }
  return bets
}

const RICH = { maker: 1e9 }

// ---------------------------------------------------------------- the probes

const d = process.env.PROBE ? describe : describe.skip

d('cpmm-multi-2 net(g) monotonicity probe', () => {
  jest.setTimeout(600_000)

  // ------------------------------------------------------------ probe 0
  it('0. transcribed evalG/solve reproduces the public API', () => {
    const configs: {
      label: string
      answers: Answer[]
      basketSize: number
      makers: MakerCfg
      bet: number
    }[] = [
      {
        label: 'extreme p, basket={0}, both makers, bet 60',
        answers: mkAnswers('extreme'),
        basketSize: 1,
        makers: 'both',
        bet: 60,
      },
      {
        label: 'moderate p, basket={0,1}, no makers, bet 500',
        answers: mkAnswers('moderate'),
        basketSize: 2,
        makers: 'none',
        bet: 500,
      },
      {
        label: 'p=0.5 control, basket={0}, basket-pin, bet 5',
        answers: mkAnswers('p05-control'),
        basketSize: 1,
        makers: 'basket-pin',
        bet: 5,
      },
    ]
    console.log('\n--- 0. transcription validation ---')
    for (const c of configs) {
      const basket = c.answers.slice(0, c.basketSize)
      const unfilled = mkMakers(c.answers, c.basketSize, c.makers)
      const solver = makeSolver(
        c.answers,
        basket,
        undefined,
        cloneBets(unfilled),
        { ...RICH }
      )
      const mine = solver.solve(c.bet)
      const pub = publicV2(c.answers, basket, c.bet, unfilled, RICH)

      // The public result's total taker amount equals net(g_solved) by construction
      // (redemption fills zero the NO legs and credit netOthers/m to the YES legs).
      const pubTotal = totalTakerAmount(pub)
      const netDiff = Math.abs((mine.solved?.net ?? NaN) - pubTotal)

      // Final pool state must match answer-by-answer.
      let maxProbDiff = 0
      for (const ua of pub.updatedAnswers) {
        const r =
          mine.solved?.yesBetResults.find((b) => b.answer.id === ua.id) ??
          mine.solved?.noBetResults.find((b) => b.answer.id === ua.id)
        if (!r) continue
        const myProb = getCpmmProbability(r.cpmmState.pool, r.cpmmState.p)
        maxProbDiff = Math.max(maxProbDiff, Math.abs(myProb - ua.prob))
      }
      console.log(
        `${c.label.padEnd(52)} |net-pubTotal|=${fmt(netDiff)}  maxProbDiff=${fmt(
          maxProbDiff
        )}`
      )
      expect(netDiff).toBeLessThan(1e-9)
      expect(maxProbDiff).toBeLessThan(1e-12)
    }
  })

  // ------------------------------------------------------------ probe 1
  it('1. dense net(g) sampling: strict monotonicity at general p with limits', () => {
    const NPTS = 800
    const shapes: Shape[] = ['extreme', 'moderate', 'p05-control']
    const makerCfgs: MakerCfg[] = ['none', 'basket-pin', 'other-side', 'both']
    const basketSizes = [1, 2]

    type Violation = {
      config: string
      g0: number
      g1: number
      drop: number
      relDrop: number
      net0: number
      net1: number
    }
    let worst: Violation | undefined
    let plateauCount = 0
    let worstPlateau: { config: string; g0: number; g1: number } | undefined
    console.log(
      '\n--- 1. dense net(g) sampling: 800 pts operational sweep (net <= ~1500,' +
        ' covers all probe-2 bets + maker pin/exhaustion kinks) + 800 pts boundary' +
        ' sweep (up to the Sum-prob->1 feasibility cutoff) ---'
    )

    for (const shape of shapes) {
      for (const basketSize of basketSizes) {
        for (const makerCfg of makerCfgs) {
          const answers = mkAnswers(shape)
          const basket = answers.slice(0, basketSize)
          const unfilled = mkMakers(answers, basketSize, makerCfg)
          const solver = makeSolver(answers, basket, undefined, unfilled, {
            ...RICH,
          })
          const label = `${shape}/m=${basketSize}/${makerCfg}`

          // Boundary of feasibility: for m >= 2 the basket prob-sum reaches 1 at
          // finite g; for m = 1 it reaches the target <= 1e-9 numeric cutoff at
          // large-but-finite g (~1.6e9 at this pool scale). Locate it by doubling
          // + bisection on evalG === undefined.
          let gBoundary = Infinity
          {
            let lo = 1
            let hi = 1
            let found = false
            while (hi < 2 ** 40) {
              if (solver.evalG(hi) === undefined) {
                found = true
                break
              }
              lo = hi
              hi *= 2
            }
            if (found) {
              for (let i = 0; i < 80; i++) {
                const mid = (lo + hi) / 2
                if (solver.evalG(mid) === undefined) hi = mid
                else lo = mid
                if (mid === lo || mid === hi) break
              }
              gBoundary = lo
            }
          }
          // Operational cap: the g at which net ~ 1500 (3x the largest probe-2
          // standard bet; also past the maker-order exhaustion kinks).
          let gNetCap: number
          {
            let hi = 1
            while ((solver.evalG(hi)?.net ?? Infinity) < 1500) hi *= 2
            gNetCap = binarySearch(0, hi, (gg) => {
              const r = solver.evalG(gg)
              return r ? r.net - 1500 : 1
            })
          }

          const sweeps: { name: string; gTop: number }[] = [
            { name: 'op', gTop: Math.min(gNetCap, gBoundary * 0.999) },
          ]
          if (isFinite(gBoundary) && gBoundary * 0.999 > gNetCap * 1.01) {
            sweeps.push({ name: 'bd', gTop: gBoundary * 0.999 })
          }

          for (const { name, gTop } of sweeps) {
            // Sample net(g) at NPTS uniform points on (0, gTop].
            let prevG = 0
            let prevNet = 0 // net(0) = 0 (empty basket, eta = 0)
            let localWorst: Violation | undefined
            let localPlateaus = 0
            let undefinedHoles = 0
            for (let i = 1; i <= NPTS; i++) {
              const g = (i / NPTS) * gTop
              const r = solver.evalG(g)
              if (!r) {
                undefinedHoles++
                continue
              }
              const dnet = r.net - prevNet
              if (dnet < 0) {
                const v = {
                  config: `${label}[${name}]`,
                  g0: prevG,
                  g1: g,
                  drop: -dnet,
                  relDrop: -dnet / Math.max(1, Math.abs(prevNet)),
                  net0: prevNet,
                  net1: r.net,
                }
                if (!localWorst || v.relDrop > localWorst.relDrop) localWorst = v
                if (!worst || v.relDrop > worst.relDrop) worst = v
              } else if (dnet === 0) {
                localPlateaus++
                plateauCount++
                if (!worstPlateau)
                  worstPlateau = { config: `${label}[${name}]`, g0: prevG, g1: g }
              }
              prevG = g
              prevNet = r.net
            }
            console.log(
              `${label.padEnd(30)} [${name}] gTop=${gTop.toExponential(3)} ` +
                `worstDrop=${localWorst ? fmt(localWorst.drop) : '        none'} ` +
                `plateaus=${localPlateaus} undefHoles=${undefinedHoles}`
            )
            expect(undefinedHoles).toBe(0)
          }
        }
      }
    }

    if (worst) {
      console.log(
        `\nWORST MONOTONICITY VIOLATION: ${worst.config} ` +
          `net(${worst.g0}) = ${worst.net0} -> net(${worst.g1}) = ${worst.net1} ` +
          `(drop ${worst.drop.toExponential(6)}, rel ${worst.relDrop.toExponential(6)})`
      )
    } else {
      console.log(
        `\nno local decrease found; plateaus (exact equal consecutive nets): ${plateauCount}` +
          (worstPlateau
            ? ` (first at ${worstPlateau.config} g in [${worstPlateau.g0}, ${worstPlateau.g1}])`
            : '')
      )
    }
    // Strict-increase premise: any measurable dip is a finding. Tolerance is
    // relative to |net| (inner eta bisection resolves to ~etaHi/2^50, so net
    // carries O(1e-10) absolute noise at operational scale, proportionally more
    // in the boundary sweep where net ~ 1e9).
    expect(worst?.relDrop ?? 0).toBeLessThan(1e-9)
  })

  // ------------------------------------------------------------ probe 2
  it('2. cost == betAmount, sum prob == 1, pools > 0 via the public API', () => {
    type Row = {
      config: string
      bet: number
      residual: number
      sumProbErr: number
      minPool: number
    }
    const rows: Row[] = []
    const run = (
      label: string,
      answers: Answer[],
      basketSize: number,
      unfilled: LimitBet[],
      bet: number
    ) => {
      const basket = answers.slice(0, basketSize)
      const r = publicV2(answers, basket, bet, unfilled, RICH)
      rows.push({
        config: label,
        bet,
        residual: totalTakerAmount(r) - bet,
        sumProbErr: sumProbAfter(r) - 1,
        minPool: minPoolAfter(r),
      })
    }

    const shapes: Shape[] = ['extreme', 'moderate', 'p05-control']
    const makerCfgs: MakerCfg[] = ['none', 'basket-pin', 'other-side', 'both']
    for (const shape of shapes) {
      for (const basketSize of [1, 2]) {
        for (const makerCfg of makerCfgs) {
          for (const bet of [5, 60, 500]) {
            const answers = mkAnswers(shape)
            run(
              `${shape}/m=${basketSize}/${makerCfg}`,
              answers,
              basketSize,
              mkMakers(answers, basketSize, makerCfg),
              bet
            )
          }
        }
      }
    }
    // whale bets on an ante-1000-scale market (L = 1000 balanced pools)
    for (const shape of ['extreme', 'moderate'] as const) {
      for (const makerCfg of ['none', 'both'] as const) {
        for (const bet of [1e4, 1e5]) {
          const answers = mkAnswers(shape, 1000)
          run(
            `whale L=1000 ${shape}/m=1/${makerCfg}`,
            answers,
            1,
            mkMakers(answers, 1, makerCfg, 10),
            bet
          )
        }
      }
    }

    rows.sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual))
    console.log('\n--- 2. cost==betAmount invariant (worst 15 by |residual|) ---')
    console.log(
      'config'.padEnd(36) +
        'bet'.padStart(9) +
        '  residual'.padStart(14) +
        '  sumProb-1'.padStart(14) +
        '  minPool'.padStart(12)
    )
    for (const r of rows.slice(0, 15)) {
      console.log(
        r.config.padEnd(36) +
          String(r.bet).padStart(9) +
          fmt(r.residual, 14) +
          fmt(r.sumProbErr, 14) +
          r.minPool.toExponential(2).padStart(12)
      )
    }
    const worstResidual = Math.max(...rows.map((r) => Math.abs(r.residual)))
    const worstSumProb = Math.max(...rows.map((r) => Math.abs(r.sumProbErr)))
    const minPool = Math.min(...rows.map((r) => r.minPool))
    console.log(
      `\nworst |residual| = ${worstResidual.toExponential(6)}, ` +
        `worst |sumProb-1| = ${worstSumProb.toExponential(6)}, ` +
        `min pool = ${minPool.toExponential(6)}`
    )
    expect(worstResidual).toBeLessThan(1e-6)
    expect(worstSumProb).toBeLessThan(1e-6)
    expect(minPool).toBeGreaterThan(0)
  })

  // ------------------------------------------------------------ probe 3
  it('3. whale / feasibility-boundary behavior, n=3, basket={0}', () => {
    console.log('\n--- 3. whale/boundary: n=3, ps=[0.5,0.3,0.2], basket={0} ---')
    console.log(
      'L'.padStart(6) +
        'bet'.padStart(10) +
        'g'.padStart(16) +
        'eta'.padStart(16) +
        'residual'.padStart(14) +
        'sumProb-1'.padStart(14) +
        'maxProb'.padStart(12) +
        'dbl'.padStart(5) +
        '  guard'
    )
    for (const L of [100, 1000]) {
      for (const bet of [1e3, 1e4, 1e5]) {
        const answers = [0.5, 0.3, 0.2].map((p, i) => getAnswerWithP(i, p, L))
        const basket = [answers[0]]
        const solver = makeSolver(answers, basket, undefined, [], {})
        let guard = ''
        let out = ''
        try {
          const { g, doublings, solved } = solver.solve(bet)
          const pub = publicV2(answers, basket, bet, [], {})
          const residual = totalTakerAmount(pub) - bet
          const sumProbErr = sumProbAfter(pub) - 1
          const maxProb = Math.max(...pub.updatedAnswers.map((a) => a.prob))
          // g-resolution amplification: local slope x bisection step (gHi / 2^50)
          const gStep = solver.solve(bet).gHi / 2 ** 50
          const rUp = solver.evalG(g + Math.max(gStep, g * 1e-9))
          const slope = rUp
            ? (rUp.net - (solved?.net ?? 0)) / Math.max(gStep, g * 1e-9)
            : NaN
          out =
            String(L).padStart(6) +
            bet.toExponential(0).padStart(10) +
            g.toExponential(6).padStart(16) +
            (solved?.eta ?? 0).toExponential(6).padStart(16) +
            fmt(residual, 14) +
            fmt(sumProbErr, 14) +
            maxProb.toFixed(6).padStart(12) +
            String(doublings).padStart(5) +
            `  slope~${isNaN(slope) ? '?' : slope.toFixed(3)}`
          expect(Math.abs(residual)).toBeLessThan(1e-6)
          expect(Math.abs(sumProbErr)).toBeLessThan(1e-6)
        } catch (e) {
          guard = ` THREW: ${(e as Error).message}`
          out =
            String(L).padStart(6) +
            bet.toExponential(0).padStart(10) +
            guard
        }
        console.log(out + guard)
      }
    }
  })

  // ------------------------------------------------------------ probe x
  it('x. adversarial: maker balance binding ACROSS two non-basket answers', () => {
    // The inner eta solve previews each NO leg with a per-leg COPY of the working
    // balances (othersSumAtEta never applies makers), but the realization pass
    // decrements the shared balance between legs. A maker with YES bids on TWO
    // non-basket answers and a balance that covers only one of them makes
    // preview != realization: the realized sum-prob undershoots the target.
    const answers = mkAnswers('extreme') // [0.9, 0.05, 0.03, 0.02]
    const basket = [answers[0]]
    const unfilled = [
      getLimitBet('poor1', answers[1], 'YES', 'poorMaker', 100, 0.03),
      getLimitBet('poor2', answers[2], 'YES', 'poorMaker', 100, 0.011),
    ]
    const balances = { poorMaker: 0.75 } // covers ~one leg's fill, not both

    console.log('\n--- x. cross-answer maker balance binding ---')
    for (const bet of [60, 500]) {
      const solver = makeSolver(answers, basket, undefined, cloneBets(unfilled), {
        ...balances,
      })
      const { solved } = solver.solve(bet)
      const pub = publicV2(answers, basket, bet, unfilled, balances)
      // v1 comparison on the identical config (same taker-charge/sum-prob checks)
      const pubV1 = calculateCpmmMultiArbitrageYesBets(
        answers,
        basket,
        bet,
        undefined,
        cloneBets(unfilled),
        { ...balances },
        noFees,
        'cpmm-multi-1'
      )
      const residual = totalTakerAmount(pub) - bet
      const sumProbErr = sumProbAfter(pub) - 1
      const sumProbErrV1 = sumProbAfter(pubV1) - 1
      const previewVsRealized =
        (solved?.target ?? NaN) - (solved?.realizedOthersSum ?? NaN)
      console.log(
        `bet ${String(bet).padStart(4)}: residual=${fmt(residual)} ` +
          `sumProb-1=${fmt(sumProbErr)} target-realizedOthersSum=${fmt(
            previewVsRealized
          )} v1 sumProb-1=${fmt(sumProbErrV1)}`
      )
      // Report-only softly; hard-assert the taker charge invariant, which is the
      // money artifact if it breaks.
      expect(Math.abs(residual)).toBeLessThan(1e-6)
    }
  })
})
