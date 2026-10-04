// Differential test of the cpmm-1 and cpmm-multi-1 entry points against main.
//
// The cpmm-multi-2 branch claims that, with both of its switches off, every
// cpmm-1 and cpmm-multi-1 entry point behaves exactly as on main apart from
// two deliberate fixes to sales. This probe checks that claim directly: it
// runs each entry point on seeded random markets through the code on this
// branch ("head") and through main's version of the same code, vendored at the
// merge base under ./parity-baseline ("baseline"), and asserts the results are
// identical after canonicalisation (sorted keys, timestamps stripped, NaN,
// ±Infinity and -0 written out so Object.is-level differences show).
//
// Exactly two divergence classes are allowed, and both are recognised from the
// baseline's own behaviour, never from the head's:
//   1. NaN fee: the baseline throws "only works for p = 0.5, got NaN", the
//      dust-fill NaN fee. The head must then go through.
//   2. Coarse sale: the baseline's bisection for a sale's cost found an amount
//      that sells more than a millionth more or fewer shares than asked. The
//      head must then sell the shares asked.
// Any other difference fails the test.
//
// Run with:  cd common && PROBE=1 npx jest cpmm-multi-1-parity-probe
// Skipped (describe.skip) in normal test runs.

import { sum, sumBy } from 'lodash'
import { Answer } from './answer'
import { Bet, LimitBet } from './bet'
import { CPMMContract, CPMMMultiContract } from './contract'
import { noFees } from './fees'

import * as headCpmm from './calculate-cpmm'
import * as headArb from './calculate-cpmm-arbitrage'
import * as headSell from './sell-bet'
import * as headBet from './new-bet'

import * as baseCpmm from './parity-baseline/calculate-cpmm'
import * as baseArb from './parity-baseline/calculate-cpmm-arbitrage'
import * as baseSell from './parity-baseline/sell-bet'
import * as baseBet from './parity-baseline/new-bet'

const d = process.env.PROBE ? describe : describe.skip

const SEEDS = [1, 2, 3]
const CASES_PER_SEED = 150

// Prefix of the error main throws on a dust fill whose fee came out NaN.
const NAN_FEE_ERROR = 'only works for p = 0.5, got NaN'
// A sale is "coarse" when the shares sold miss the shares asked by more than
// this fraction of the shares asked.
const COARSE_SALE_TOLERANCE = 1e-6

// ------------------------------------------------------------------ the sides

type Balances = { [userId: string]: number }
type Side = {
  name: string
  arbitrageBet: typeof headArb.calculateCpmmMultiArbitrageBet
  arbitrageYesBets: (
    answers: Answer[],
    answersToBuy: Answer[],
    betAmount: number,
    limitProb: number | undefined,
    unfilledBets: LimitBet[],
    balanceByUserId: Balances
  ) => unknown
  cpmmAmountToBuyShares: typeof headCpmm.calculateCpmmAmountToBuyShares
  amountToBuyShares: typeof headCpmm.calculateAmountToBuyShares
  cpmmSale: typeof headCpmm.calculateCpmmSale
  addLiquiditySumToOne: typeof headCpmm.addCpmmMultiLiquidityAnswersSumToOne
  multiSellBetInfo: typeof headSell.getCpmmMultiSellBetInfo
  multiSellSharesInfo: typeof headSell.getCpmmMultiSellSharesInfo
  cpmmSellBetInfo: typeof headSell.getCpmmSellBetInfo
  saleResult: typeof headSell.getSaleResult
  computeCpmmBet: typeof headBet.computeCpmmBet
  newMultiBetInfo: typeof headBet.getNewMultiCpmmBetInfo
  betDownToOne: typeof headBet.getBetDownToOneMultiBetInfo
}

const head: Side = {
  name: 'head',
  arbitrageBet: headArb.calculateCpmmMultiArbitrageBet,
  arbitrageYesBets: (answers, toBuy, amount, limitProb, unfilled, balances) =>
    headArb.calculateCpmmMultiArbitrageYesBets(
      answers,
      toBuy,
      amount,
      limitProb,
      unfilled,
      balances,
      noFees,
      'cpmm-multi-1'
    ),
  cpmmAmountToBuyShares: headCpmm.calculateCpmmAmountToBuyShares,
  amountToBuyShares: headCpmm.calculateAmountToBuyShares,
  cpmmSale: headCpmm.calculateCpmmSale,
  addLiquiditySumToOne: headCpmm.addCpmmMultiLiquidityAnswersSumToOne,
  multiSellBetInfo: headSell.getCpmmMultiSellBetInfo,
  multiSellSharesInfo: headSell.getCpmmMultiSellSharesInfo,
  cpmmSellBetInfo: headSell.getCpmmSellBetInfo,
  saleResult: headSell.getSaleResult,
  computeCpmmBet: headBet.computeCpmmBet,
  newMultiBetInfo: headBet.getNewMultiCpmmBetInfo,
  betDownToOne: headBet.getBetDownToOneMultiBetInfo,
}

const baseline: Side = {
  name: 'baseline',
  arbitrageBet: baseArb.calculateCpmmMultiArbitrageBet,
  arbitrageYesBets: (answers, toBuy, amount, limitProb, unfilled, balances) =>
    baseArb.calculateCpmmMultiArbitrageYesBets(
      answers,
      toBuy,
      amount,
      limitProb,
      unfilled,
      balances,
      noFees
    ),
  cpmmAmountToBuyShares: baseCpmm.calculateCpmmAmountToBuyShares,
  amountToBuyShares: baseCpmm.calculateAmountToBuyShares,
  cpmmSale: baseCpmm.calculateCpmmSale,
  addLiquiditySumToOne: baseCpmm.addCpmmMultiLiquidityAnswersSumToOne,
  multiSellBetInfo: baseSell.getCpmmMultiSellBetInfo,
  multiSellSharesInfo: baseSell.getCpmmMultiSellSharesInfo,
  cpmmSellBetInfo: baseSell.getCpmmSellBetInfo,
  saleResult: baseSell.getSaleResult,
  computeCpmmBet: baseBet.computeCpmmBet,
  newMultiBetInfo: baseBet.getNewMultiCpmmBetInfo,
  betDownToOne: baseBet.getBetDownToOneMultiBetInfo,
}

// ------------------------------------------------------------------ seeded rng

// mulberry32. No Math.random anywhere in this file.
const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// FNV-1a, so each (seed, case, purpose) gets its own independent stream and
// adding an entry point doesn't perturb the inputs of the others.
const hash = (s: string) => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

type Rng = () => number
const rngFor = (seed: number, caseIndex: number, purpose: string): Rng =>
  mulberry32(hash(`${seed}/${caseIndex}/${purpose}`))

const uniform = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo)
const logUniform = (rng: Rng, lo: number, hi: number) =>
  Math.exp(uniform(rng, Math.log(lo), Math.log(hi)))
const int = (rng: Rng, lo: number, hi: number) =>
  lo + Math.floor(rng() * (hi - lo + 1))
const pick = <T>(rng: Rng, xs: T[]) => xs[Math.floor(rng() * xs.length)]
// Fisher-Yates, so the order depends only on the rng.
const shuffle = <T>(rng: Rng, xs: T[]) => {
  const out = [...xs]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
const chance = (rng: Rng, p: number) => rng() < p
const outcomeOf = (rng: Rng): 'YES' | 'NO' => (chance(rng, 0.5) ? 'YES' : 'NO')
// Limit orders rest at whole-percent prices in the band bets are held to.
const limitProbOf = (rng: Rng) => Math.round(uniform(rng, 1, 99)) / 100
// 30% of taker bets carry a limit prob.
const takerLimitProb = (rng: Rng) =>
  chance(rng, 0.3) ? limitProbOf(rng) : undefined

// ------------------------------------------------------------------ fixtures

const CONTRACT_ID = 'parity-contract'

// A cpmm-multi-1 answer at prob with k = poolYes * poolNo (p = 0.5).
const mkAnswer = (index: number, prob: number, k: number): Answer => {
  const poolYes = Math.sqrt((k * (1 - prob)) / prob)
  const poolNo = k / poolYes
  return {
    id: `answer${index}`,
    index,
    contractId: CONTRACT_ID,
    userId: `creator`,
    text: `Answer ${index}`,
    createdTime: 0,
    poolYes,
    poolNo,
    p: 0.5,
    prob,
    totalLiquidity: 0,
    subsidyPool: 0,
    volume: 0,
    probChanges: { day: 0, week: 0, month: 0 },
  }
}

const withPool = (answer: Answer, pool: { YES: number; NO: number }): Answer => ({
  ...answer,
  poolYes: pool.YES,
  poolNo: pool.NO,
  prob: baseCpmm.getCpmmProbability(pool, 0.5),
})

// A cpmm-multi-1 answer as a market row's cached copy holds it: without p.
// Both sides get the same object; the head's answerP falls back to 0.5.
const withoutP = (answer: Answer): Answer => {
  const copy: Partial<Answer> = { ...answer }
  delete copy.p
  return copy as Answer
}

const mkMultiContract = (
  answers: Answer[],
  shouldAnswersSumToOne: boolean
): CPMMMultiContract =>
  ({
    id: CONTRACT_ID,
    mechanism: 'cpmm-multi-1',
    outcomeType: 'MULTIPLE_CHOICE',
    shouldAnswersSumToOne,
    addAnswersMode: shouldAnswersSumToOne ? 'DISABLED' : 'ANYONE',
    visibility: 'public',
    collectedFees: noFees,
    totalLiquidity: 0,
    subsidyPool: 0,
    answers,
  } as unknown as CPMMMultiContract)

const mkBinaryContract = (
  pool: { YES: number; NO: number },
  p: number
): CPMMContract =>
  ({
    id: CONTRACT_ID,
    mechanism: 'cpmm-1',
    outcomeType: 'BINARY',
    visibility: 'public',
    collectedFees: noFees,
    pool,
    p,
    prob: baseCpmm.getCpmmProbability(pool, p),
    totalLiquidity: 0,
    subsidyPool: 0,
  } as unknown as CPMMContract)

const mkLimitBet = (
  id: string,
  userId: string,
  answerId: string | undefined,
  outcome: 'YES' | 'NO',
  orderAmount: number,
  limitProb: number,
  filledAmount: number,
  probAtPlacement: number
): LimitBet => ({
  id,
  userId,
  contractId: CONTRACT_ID,
  answerId,
  createdTime: 0,
  amount: filledAmount,
  loanAmount: 0,
  outcome,
  shares: filledAmount / (outcome === 'YES' ? limitProb : 1 - limitProb),
  probBefore: probAtPlacement,
  probAfter: probAtPlacement,
  fees: noFees,
  isRedemption: false,
  orderAmount,
  limitProb,
  isFilled: false,
  isCancelled: false,
  fills: [],
})

// Makers: a whale, one with a middling balance, and one with almost nothing,
// so fills run into balance limits and dust fills.
const mkMakers = (rng: Rng): Balances => ({
  whale: 1e6,
  mid: uniform(rng, 20, 220),
  dust: uniform(rng, 0, 5),
})

const mkRestingOrders = (
  rng: Rng,
  answers: Answer[] | undefined,
  probOf: (answerId: string | undefined) => number
) => {
  const makers = mkMakers(rng)
  const makerIds = Object.keys(makers)
  const count = int(rng, 0, 4)
  const orders: LimitBet[] = []
  for (let i = 0; i < count; i++) {
    const answerId = answers ? pick(rng, answers).id : undefined
    const orderAmount = logUniform(rng, 1, 300)
    // Most orders are untouched; some are partly filled already.
    const filledAmount = chance(rng, 0.25)
      ? orderAmount * uniform(rng, 0.05, 0.95)
      : 0
    orders.push(
      mkLimitBet(
        `order${i}`,
        pick(rng, makerIds),
        answerId,
        outcomeOf(rng),
        orderAmount,
        limitProbOf(rng),
        filledAmount,
        probOf(answerId)
      )
    )
  }
  return { unfilledBets: orders, balanceByUserId: makers }
}

type MultiMarket = {
  contract: CPMMMultiContract
  answers: Answer[]
  unfilledBets: LimitBet[]
  balanceByUserId: Balances
}

// Pools opened at random odds, then partly traded through main's own
// arbitrage so they carry the kind of float noise real markets do.
const mkSumToOneMarket = (rng: Rng): MultiMarket => {
  const n = int(rng, 2, 12)
  const weights = Array.from({ length: n }, () => logUniform(rng, 1, 60))
  const total = sum(weights)
  let answers = weights.map((w, i) => mkAnswer(i, w / total, logUniform(rng, 10, 1e4)))

  const trades = int(rng, 0, 3)
  for (let t = 0; t < trades; t++) {
    const answer = pick(rng, answers)
    const outcome = outcomeOf(rng)
    const amount = logUniform(rng, 1, 500)
    try {
      const { newBetResult, otherBetResults } = baseArb.calculateCpmmMultiArbitrageBet(
        answers,
        answer,
        outcome,
        amount,
        undefined,
        [],
        {},
        noFees
      )
      const poolById = new Map<string, { YES: number; NO: number }>()
      for (const r of [newBetResult, ...otherBetResults])
        poolById.set(r.answer.id, r.cpmmState.pool)
      answers = answers.map((a) => withPool(a, poolById.get(a.id) ?? { YES: a.poolYes, NO: a.poolNo }))
    } catch (_e) {
      // A trade main refuses leaves the pools as they were.
    }
  }

  if (chance(rng, 0.5)) answers = answers.map(withoutP)
  const probOf = (id: string | undefined) => answers.find((a) => a.id === id)!.prob
  const { unfilledBets, balanceByUserId } = mkRestingOrders(rng, answers, probOf)
  return { contract: mkMultiContract(answers, true), answers, unfilledBets, balanceByUserId }
}

const mkIndependentMarket = (rng: Rng): MultiMarket => {
  const n = int(rng, 2, 12)
  let answers = Array.from({ length: n }, (_, i) =>
    mkAnswer(i, uniform(rng, 0.01, 0.99), logUniform(rng, 10, 1e4))
  )

  const trades = int(rng, 0, 3)
  for (let t = 0; t < trades; t++) {
    const i = int(rng, 0, n - 1)
    const a = answers[i]
    const outcome = outcomeOf(rng)
    const amount = logUniform(rng, 1, 500)
    try {
      const { cpmmState } = baseCpmm.computeFills(
        { pool: { YES: a.poolYes, NO: a.poolNo }, p: 0.5, collectedFees: noFees },
        outcome,
        amount,
        undefined,
        [],
        {}
      )
      answers = answers.map((x, j) => (j === i ? withPool(x, cpmmState.pool) : x))
    } catch (_e) {
      // A trade main refuses leaves the pool as it was.
    }
  }

  if (chance(rng, 0.5)) answers = answers.map(withoutP)
  const probOf = (id: string | undefined) => answers.find((a) => a.id === id)!.prob
  const { unfilledBets, balanceByUserId } = mkRestingOrders(rng, answers, probOf)
  return { contract: mkMultiContract(answers, false), answers, unfilledBets, balanceByUserId }
}

type BinaryMarket = {
  contract: CPMMContract
  state: headCpmm.CpmmState
  unfilledBets: LimitBet[]
  balanceByUserId: Balances
}

// A cpmm-1 market: liquidity L = Y^p * N^(1-p) at (prob, p), partly traded.
const mkBinaryMarket = (rng: Rng): BinaryMarket => {
  const p = uniform(rng, 0.05, 0.95)
  const prob = uniform(rng, 0.02, 0.98)
  const L = logUniform(rng, 10, 1e4)
  const r = ((1 - p) * prob) / (p * (1 - prob))
  const poolYes = L / r ** (1 - p)
  let pool = { YES: poolYes, NO: poolYes * r }

  const trades = int(rng, 0, 3)
  for (let t = 0; t < trades; t++) {
    const outcome = outcomeOf(rng)
    const amount = logUniform(rng, 1, 500)
    try {
      const { cpmmState } = baseCpmm.computeFills(
        { pool, p, collectedFees: noFees },
        outcome,
        amount,
        undefined,
        [],
        {}
      )
      pool = { YES: cpmmState.pool.YES, NO: cpmmState.pool.NO }
    } catch (_e) {
      // A trade main refuses leaves the pool as it was.
    }
  }

  const contract = mkBinaryContract(pool, p)
  const { unfilledBets, balanceByUserId } = mkRestingOrders(rng, undefined, () => contract.prob)
  return {
    contract,
    state: { pool: contract.pool, p: contract.p, collectedFees: noFees },
    unfilledBets,
    balanceByUserId,
  }
}

// Shares a trader could plausibly hold or want in an answer: up to twice its pool.
const sharesIn = (rng: Rng, pool: { YES: number; NO: number }) =>
  logUniform(rng, 0.01, 2 * Math.max(pool.YES, pool.NO))

// ------------------------------------------------------------------ canonical form

const TIMESTAMP_KEYS = new Set(['createdTime', 'timestamp', 'expiresAt'])

const encode = (v: unknown): unknown => {
  if (typeof v === 'number') {
    if (Number.isNaN(v)) return 'NaN'
    if (v === Infinity) return 'Infinity'
    if (v === -Infinity) return '-Infinity'
    if (Object.is(v, -0)) return '-0'
    return v
  }
  if (v === undefined) return '<undefined>'
  if (v === null || typeof v !== 'object') return v
  if (Array.isArray(v)) return v.map(encode)
  const out: { [key: string]: unknown } = {}
  for (const key of Object.keys(v as object).sort()) {
    if (TIMESTAMP_KEYS.has(key)) continue
    out[key] = encode((v as { [key: string]: unknown })[key])
  }
  return out
}

const canonical = (v: unknown) => JSON.stringify(encode(v))

type Outcome =
  | { ok: true; value: unknown; canon: string }
  | { ok: false; error: string; canon: string }

const attempt = (f: () => unknown): Outcome => {
  try {
    const value = f()
    return { ok: true, value, canon: 'ok:' + canonical(value) }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    return { ok: false, error, canon: 'error:' + error }
  }
}

// ------------------------------------------------------------------ cases

// One input to one entry point, runnable on either side. A sale case also
// says how many shares it asked to sell and how to read off how many a
// side's result sold, so a coarse sale can be recognised.
type Case = {
  run: (side: Side) => unknown
  sale?: { asked: number; sold: (side: Side, value: unknown) => number }
}

type CaseBuilder = (seed: number, caseIndex: number) => Case

const sumToOne = (seed: number, i: number) => mkSumToOneMarket(rngFor(seed, i, 'sum-to-one'))
const independent = (seed: number, i: number) =>
  mkIndependentMarket(rngFor(seed, i, 'independent'))
const binary = (seed: number, i: number) => mkBinaryMarket(rngFor(seed, i, 'binary'))

// The shares a sale result sold, from the bet it wrote: a sale's bet carries
// the (negative) shares sold.
const soldFromNewBet = (_side: Side, value: unknown) =>
  -(value as { newBet: { shares: number } }).newBet.shares

const ENTRY_POINTS: { [name: string]: CaseBuilder } = {
  calculateCpmmMultiArbitrageBet: (seed, i) => {
    const m = sumToOne(seed, i)
    const rng = rngFor(seed, i, 'calculateCpmmMultiArbitrageBet')
    const answer = pick(rng, m.answers)
    const outcome = outcomeOf(rng)
    const amount = logUniform(rng, 0.5, 1000)
    const limitProb = takerLimitProb(rng)
    return {
      run: (side) =>
        side.arbitrageBet(
          m.answers,
          answer,
          outcome,
          amount,
          limitProb,
          m.unfilledBets,
          m.balanceByUserId,
          noFees
        ),
    }
  },

  calculateCpmmMultiArbitrageYesBets: (seed, i) => {
    const m = sumToOne(seed, i)
    const rng = rngFor(seed, i, 'calculateCpmmMultiArbitrageYesBets')
    const count = int(rng, 1, Math.min(3, m.answers.length - 1))
    const answersToBuy = shuffle(rng, m.answers).slice(0, count)
    const amount = logUniform(rng, 0.5, 1000)
    const limitProb = takerLimitProb(rng)
    return {
      run: (side) =>
        side.arbitrageYesBets(
          m.answers,
          answersToBuy,
          amount,
          limitProb,
          m.unfilledBets,
          m.balanceByUserId
        ),
    }
  },

  calculateCpmmAmountToBuyShares: (seed, i) => {
    const rng = rngFor(seed, i, 'calculateCpmmAmountToBuyShares')
    const outcome = outcomeOf(rng)
    if (chance(rng, 1 / 3)) {
      const b = binary(seed, i)
      const shares = sharesIn(rng, b.contract.pool as { YES: number; NO: number })
      return {
        run: (side) =>
          side.cpmmAmountToBuyShares(b.contract, shares, outcome, b.unfilledBets, b.balanceByUserId),
      }
    }
    const m = chance(rng, 0.5) ? sumToOne(seed, i) : independent(seed, i)
    const answer = pick(rng, m.answers)
    const shares = sharesIn(rng, { YES: answer.poolYes, NO: answer.poolNo })
    return {
      run: (side) =>
        side.cpmmAmountToBuyShares(
          m.contract,
          shares,
          outcome,
          m.unfilledBets,
          m.balanceByUserId,
          answer
        ),
    }
  },

  getCpmmMultiSellBetInfo: (seed, i) => {
    const m = sumToOne(seed, i)
    const rng = rngFor(seed, i, 'getCpmmMultiSellBetInfo')
    const answer = pick(rng, m.answers)
    const outcome = outcomeOf(rng)
    const shares = sharesIn(rng, { YES: answer.poolYes, NO: answer.poolNo })
    const limitProb = takerLimitProb(rng)
    const loanPaid = chance(rng, 0.3) ? uniform(rng, 0, 20) : 0
    return {
      run: (side) =>
        side.multiSellBetInfo(
          m.contract,
          m.answers,
          answer,
          shares,
          outcome,
          limitProb,
          m.unfilledBets,
          m.balanceByUserId,
          loanPaid
        ),
      sale: { asked: shares, sold: soldFromNewBet },
    }
  },

  getCpmmMultiSellSharesInfo: (seed, i) => {
    const m = sumToOne(seed, i)
    const rng = rngFor(seed, i, 'getCpmmMultiSellSharesInfo')
    const count = int(rng, 1, m.answers.length)
    const shuffled = shuffle(rng, m.answers)
    const userBetsByAnswerIdToSell: { [answerId: string]: Bet[] } = {}
    const loanPaidByAnswerId: { [answerId: string]: number } = {}
    for (const answer of shuffled.slice(0, count)) {
      const bets = int(rng, 1, 2)
      userBetsByAnswerIdToSell[answer.id] = Array.from({ length: bets }, (_, j) => ({
        id: `bet-${answer.id}-${j}`,
        userId: 'seller',
        contractId: CONTRACT_ID,
        answerId: answer.id,
        createdTime: 0,
        amount: 0,
        outcome: 'YES',
        shares: sharesIn(rng, { YES: answer.poolYes, NO: answer.poolNo }),
        probBefore: answer.prob,
        probAfter: answer.prob,
        fees: noFees,
        isRedemption: false,
      }))
      if (chance(rng, 0.3)) loanPaidByAnswerId[answer.id] = uniform(rng, 0, 20)
    }
    return {
      run: (side) =>
        side.multiSellSharesInfo(
          m.contract,
          userBetsByAnswerIdToSell,
          m.unfilledBets,
          m.balanceByUserId,
          loanPaidByAnswerId
        ),
    }
  },

  getNewMultiCpmmBetInfo: (seed, i) => {
    const rng = rngFor(seed, i, 'getNewMultiCpmmBetInfo')
    const m = chance(rng, 0.5) ? sumToOne(seed, i) : independent(seed, i)
    const answer = pick(rng, m.answers)
    const outcome = outcomeOf(rng)
    const amount = logUniform(rng, 0.5, 1000)
    const limitProb = takerLimitProb(rng)
    const expiresAt = chance(rng, 0.2) ? 1e13 : undefined
    const expiresMillisAfter = chance(rng, 0.2) ? 3600_000 : undefined
    return {
      run: (side) =>
        side.newMultiBetInfo(
          m.contract,
          m.answers,
          answer,
          outcome,
          amount,
          limitProb,
          m.unfilledBets,
          m.balanceByUserId,
          expiresAt,
          expiresMillisAfter
        ),
    }
  },

  getCpmmSellBetInfo: (seed, i) => {
    const rng = rngFor(seed, i, 'getCpmmSellBetInfo')
    const outcome = outcomeOf(rng)
    const loanPaid = chance(rng, 0.3) ? uniform(rng, 0, 20) : 0
    if (chance(rng, 0.5)) {
      const b = binary(seed, i)
      const shares = sharesIn(rng, b.contract.pool as { YES: number; NO: number })
      return {
        run: (side) =>
          side.cpmmSellBetInfo(
            shares,
            outcome,
            b.contract,
            b.unfilledBets,
            b.balanceByUserId,
            loanPaid
          ),
        sale: { asked: shares, sold: soldFromNewBet },
      }
    }
    const m = independent(seed, i)
    const answer = pick(rng, m.answers)
    const shares = sharesIn(rng, { YES: answer.poolYes, NO: answer.poolNo })
    return {
      run: (side) =>
        side.cpmmSellBetInfo(
          shares,
          outcome,
          m.contract,
          m.unfilledBets,
          m.balanceByUserId,
          loanPaid,
          answer
        ),
      sale: { asked: shares, sold: soldFromNewBet },
    }
  },

  getSaleResult: (seed, i) => {
    const rng = rngFor(seed, i, 'getSaleResult')
    const outcome = outcomeOf(rng)
    if (chance(rng, 1 / 3)) {
      const b = binary(seed, i)
      const shares = sharesIn(rng, b.contract.pool as { YES: number; NO: number })
      return {
        run: (side) =>
          side.saleResult(b.contract, shares, outcome, b.unfilledBets, b.balanceByUserId),
        sale: {
          asked: shares,
          // getSaleResult doesn't return its fills; re-run the sale it wraps.
          sold: (side) =>
            -sumBy(
              side.cpmmSale(b.state, shares, outcome, b.unfilledBets, b.balanceByUserId).takers,
              'shares'
            ),
        },
      }
    }
    const m = chance(rng, 0.5) ? sumToOne(seed, i) : independent(seed, i)
    const answer = pick(rng, m.answers)
    const shares = sharesIn(rng, { YES: answer.poolYes, NO: answer.poolNo })
    const state = {
      pool: { YES: answer.poolYes, NO: answer.poolNo },
      p: 0.5,
      collectedFees: noFees,
    }
    return {
      run: (side) =>
        side.saleResult(m.contract, shares, outcome, m.unfilledBets, m.balanceByUserId, answer),
      sale: {
        asked: shares,
        sold: (side) =>
          -sumBy(
            side.cpmmSale(state, shares, outcome, m.unfilledBets, m.balanceByUserId).takers,
            'shares'
          ),
      },
    }
  },

  computeCpmmBet: (seed, i) => {
    const b = binary(seed, i)
    const rng = rngFor(seed, i, 'computeCpmmBet')
    const outcome = outcomeOf(rng)
    const amount = logUniform(rng, 0.5, 1000)
    const limitProb = takerLimitProb(rng)
    const limitProbs = chance(rng, 0.2) ? { max: 0.99, min: 0.01 } : undefined
    return {
      run: (side) =>
        side.computeCpmmBet(
          b.state,
          outcome,
          amount,
          limitProb,
          b.unfilledBets,
          b.balanceByUserId,
          limitProbs
        ),
    }
  },

  calculateAmountToBuyShares: (seed, i) => {
    const b = binary(seed, i)
    const rng = rngFor(seed, i, 'calculateAmountToBuyShares')
    const outcome = outcomeOf(rng)
    const shares = sharesIn(rng, b.contract.pool as { YES: number; NO: number })
    return {
      run: (side) =>
        side.amountToBuyShares(b.state, shares, outcome, b.unfilledBets, b.balanceByUserId),
    }
  },

  addCpmmMultiLiquidityAnswersSumToOne: (seed, i) => {
    const m = sumToOne(seed, i)
    const rng = rngFor(seed, i, 'addCpmmMultiLiquidityAnswersSumToOne')
    const pools = Object.fromEntries(
      m.answers.map((a) => [a.id, { YES: a.poolYes, NO: a.poolNo }])
    )
    const amount = logUniform(rng, 1, 5000)
    return { run: (side) => side.addLiquiditySumToOne(pools, amount) }
  },

  getBetDownToOneMultiBetInfo: (seed, i) => {
    const m = sumToOne(seed, i)
    const rng = rngFor(seed, i, 'getBetDownToOneMultiBetInfo')
    // An answer just added at its own odds, so the probabilities sum past one.
    const added = mkAnswer(m.answers.length, uniform(rng, 0.01, 0.6), logUniform(rng, 10, 1e4))
    const answers = [...m.answers, 'p' in m.answers[0] ? added : withoutP(added)]
    const contract = mkMultiContract(answers, true)
    return {
      run: (side) => side.betDownToOne(contract, answers, m.unfilledBets, m.balanceByUserId),
    }
  },
}

// ------------------------------------------------------------------ whitelist

type Verdict = 'match' | 'nan-fee' | 'coarse-sale' | 'unexpected'

const classify = (c: Case, base: Outcome, hd: Outcome): Verdict => {
  if (base.canon === hd.canon) return 'match'

  // 1. The baseline failed the sale with the dust-fill NaN fee; the head goes through.
  if (!base.ok && base.error.includes(NAN_FEE_ERROR) && hd.ok) return 'nan-fee'

  // 2. The baseline's sale missed the shares asked by more than a millionth;
  //    the head sells the shares asked.
  if (c.sale && base.ok && hd.ok) {
    const { asked } = c.sale
    const baseMiss = Math.abs(c.sale.sold(baseline, base.value) - asked)
    const headMiss = Math.abs(c.sale.sold(head, hd.value) - asked)
    if (baseMiss > COARSE_SALE_TOLERANCE * asked && headMiss <= COARSE_SALE_TOLERANCE * asked)
      return 'coarse-sale'
  }

  return 'unexpected'
}

const firstDifference = (a: string, b: string) => {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  const from = Math.max(0, i - 80)
  return { baseline: a.slice(from, i + 120), head: b.slice(from, i + 120) }
}

// ------------------------------------------------------------------ the suite

d('cpmm-1 and cpmm-multi-1 parity with main', () => {
  jest.setTimeout(30 * 60 * 1000)

  // getCpmmSellBetInfo logs every sale on both sides.
  let log: jest.SpyInstance
  beforeAll(() => {
    log = jest.spyOn(console, 'log').mockImplementation(() => undefined)
  })
  afterAll(() => log.mockRestore())

  for (const [name, build] of Object.entries(ENTRY_POINTS)) {
    it(`${name} matches main except for the two documented sale fixes`, () => {
      const counts: { [verdict in Verdict]: number } = {
        match: 0,
        'nan-fee': 0,
        'coarse-sale': 0,
        unexpected: 0,
      }
      const unexpected: string[] = []

      for (const seed of SEEDS) {
        for (let i = 0; i < CASES_PER_SEED; i++) {
          const c = build(seed, i)
          const base = attempt(() => c.run(baseline))
          const hd = attempt(() => c.run(head))
          const verdict = classify(c, base, hd)
          counts[verdict]++
          if (verdict === 'unexpected' && unexpected.length < 5) {
            unexpected.push(
              `${name} seed=${seed} case=${i}: ` +
                JSON.stringify(firstDifference(base.canon, hd.canon), null, 2)
            )
          }
        }
      }

      console.info(`${name}: ${JSON.stringify(counts)}`)
      expect(unexpected).toEqual([])
      expect(counts.match + counts['nan-fee'] + counts['coarse-sale']).toBe(
        SEEDS.length * CASES_PER_SEED
      )
    })
  }
})
