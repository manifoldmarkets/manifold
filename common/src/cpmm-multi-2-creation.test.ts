import { sumBy } from 'lodash'
import { Answer } from './answer'
import { getCpmmProbability } from './calculate-cpmm'
import { calculateCpmmMultiArbitrageYesBets } from './calculate-cpmm-arbitrage'
import { CPMMMulti } from './contract'
import { noFees } from './fees'
import { getNewContract } from './new-contract'
import { User } from './user'

// cpmm-multi-2 (PR2c) — creation path: per-answer `initialProbs` produce a
// `cpmm-multi-2` market whose every answer's `p` is its (normalized) target
// prob, on balanced deep pools (Y = N), with the same ante budget v1 uses.
// Verified at jest level (no running dev instance): the created answers are
// then fed straight into the v2 multi-buy arb to confirm they trade and hold
// Σp = 1.

const creator = {
  id: 'creator1',
  name: 'Creator',
  username: 'creator',
  avatarUrl: '',
  createdTime: 0,
} as User

const makeMC = (
  answers: string[],
  initialProbs: number[] | undefined,
  ante = 1000,
  shouldAnswersSumToOne = true
): CPMMMulti =>
  getNewContract({
    id: 'contract1',
    slug: 'contract1',
    creator,
    question: 'Q?',
    outcomeType: 'MULTIPLE_CHOICE',
    description: '' as any,
    initialProb: 50,
    ante,
    closeTime: Date.now() + 1e9,
    visibility: 'public',
    isTwitchContract: undefined,
    min: 0,
    max: 0,
    isLogScale: false,
    answers,
    addAnswersMode: 'DISABLED',
    shouldAnswersSumToOne,
    initialProbs,
    token: 'MANA',
    coverImageUrl: undefined,
    siblingContractId: undefined,
    takerAPIOrdersDisabled: undefined,
    isAutoBounty: undefined,
    unit: '',
    midpoints: undefined,
    timezone: undefined,
    voterVisibility: undefined,
    pollType: undefined,
    maxSelections: undefined,
  } as any) as CPMMMulti

const sumProbs = (answers: Answer[]) =>
  sumBy(answers, (a) => getCpmmProbability({ YES: a.poolYes, NO: a.poolNo }, a.p))

describe('cpmm-multi-2 creation — per-answer initialProbs', () => {
  it('sets mechanism cpmm-multi-2 and per-answer p = normalized target prob', () => {
    const ante = 1200
    const contract = makeMC(['A', 'B', 'C'], [60, 30, 10], ante)
    expect(contract.mechanism).toBe('cpmm-multi-2')

    const targets = [0.6, 0.3, 0.1]
    const n = contract.answers.length
    contract.answers.forEach((a, i) => {
      // balanced deep pools: Y = N = ante / n
      expect(a.poolYes).toBeCloseTo(ante / n, 8)
      expect(a.poolNo).toBeCloseTo(ante / n, 8)
      // p_i = target, and (because Y = N) displayed prob = p_i exactly (GP6a)
      expect(a.p).toBeCloseTo(targets[i], 10)
      expect(a.prob).toBeCloseTo(targets[i], 10)
      expect(getCpmmProbability({ YES: a.poolYes, NO: a.poolNo }, a.p)).toBeCloseTo(
        targets[i],
        10
      )
    })

    // Σ prob = 1 exactly.
    expect(sumProbs(contract.answers)).toBeCloseTo(1, 10)

    // Ante budget: when any answer wins, payout = poolYes_i + Σ_{j≠i} poolNo_j,
    // which equals the ante for every i (the same budget v1 uses).
    contract.answers.forEach((a, i) => {
      const payout =
        a.poolYes +
        sumBy(
          contract.answers.filter((_, j) => j !== i),
          (o) => o.poolNo
        )
      expect(payout).toBeCloseTo(ante, 6)
    })
  })

  it('normalizes initialProbs that do not sum to 100', () => {
    const a = makeMC(['A', 'B', 'C'], [6, 3, 1]).answers
    const b = makeMC(['A', 'B', 'C'], [60, 30, 10]).answers
    a.forEach((ans, i) => expect(ans.p).toBeCloseTo(b[i].p, 12))
    expect(sumProbs(a)).toBeCloseTo(1, 10)
  })

  it('supports two-answer (versus-style) custom probs', () => {
    const contract = makeMC(['Yes', 'No'], [70, 30])
    expect(contract.mechanism).toBe('cpmm-multi-2')
    expect(contract.answers[0].p).toBeCloseTo(0.7, 10)
    expect(contract.answers[1].p).toBeCloseTo(0.3, 10)
    expect(sumProbs(contract.answers)).toBeCloseTo(1, 10)
  })

  it('regression: no initialProbs ⇒ frozen v1 cpmm-multi-1, uniform 1/n', () => {
    const ante = 1000
    const contract = makeMC(['A', 'B', 'C', 'D'], undefined, ante)
    expect(contract.mechanism).toBe('cpmm-multi-1')
    const n = contract.answers.length
    contract.answers.forEach((a) => {
      expect(a.prob).toBeCloseTo(1 / n, 10)
      expect(a.p).toBe(0.5)
      // v1 ante-maximizing pools
      expect(a.poolYes).toBeCloseTo(ante / 2, 8)
      expect(a.poolNo).toBeCloseTo(ante / (2 * n - 2), 8)
    })
  })
})

// cpmm-multi-2 (Set / INDEPENDENT_MULTIPLE_CHOICE): each answer is its own CPMM,
// so per-answer initialProbs are ABSOLUTE (no Σ=1 normalization). Same balanced
// deep pool + per-answer p representation as sum-to-one — required so the LP's
// max loss = max(Y, N) = ante/n stays funded for any target prob (an asymmetric
// p=0.5 pool would blow up max(Y,N) at the extremes ⇒ discard shares or house
// risk; see tasks/cpmm_multi_2 math TODO).
describe('cpmm-multi-2 creation — independent ("Set") absolute probs', () => {
  const independent = (
    answers: string[],
    initialProbs: number[],
    ante = 1000
  ) => makeMC(answers, initialProbs, ante, false).answers

  it('sets per-answer p = absolute prob, NOT normalized', () => {
    const ante = 900
    const probs = [80, 30, 10] // sum 120 — must NOT be rescaled
    const ans = independent(['A', 'B', 'C'], probs, ante)
    const n = ans.length
    const targets = [0.8, 0.3, 0.1]
    ans.forEach((a, i) => {
      expect(a.p).toBeCloseTo(targets[i], 10)
      expect(a.prob).toBeCloseTo(targets[i], 10)
      expect(a.poolYes).toBeCloseTo(ante / n, 8)
      expect(a.poolNo).toBeCloseTo(ante / n, 8)
    })
    // Independent ⇒ probs need not (and here do not) sum to 1.
    expect(sumProbs(ans)).toBeCloseTo(1.2, 8)
  })

  it('mechanism is cpmm-multi-2', () => {
    const contract = makeMC(['A', 'B'], [40, 90], 1000, false)
    expect(contract.mechanism).toBe('cpmm-multi-2')
  })

  it('Set absolute differs from the sum-to-one normalization for the same input', () => {
    const input = [40, 20, 10]
    const set = independent(['A', 'B', 'C'], input)
    const s2o = makeMC(['A', 'B', 'C'], input, 1000, true).answers
    // Set: absolute 0.40 / 0.20 / 0.10
    expect(set.map((a) => a.p)).toEqual([
      expect.closeTo(0.4, 10),
      expect.closeTo(0.2, 10),
      expect.closeTo(0.1, 10),
    ])
    // sum-to-one: normalized 4/7 / 2/7 / 1/7
    expect(s2o.map((a) => a.p)).toEqual([
      expect.closeTo(4 / 7, 10),
      expect.closeTo(2 / 7, 10),
      expect.closeTo(1 / 7, 10),
    ])
  })

  it('funding invariant: max(Y, N) = ante/n even at extreme probs (no house risk, no discard)', () => {
    const ante = 1000
    const ans = independent(['Long', 'Mid', 'Fav'], [1, 50, 99], ante)
    const n = ans.length
    ans.forEach((a) => {
      // balanced ⇒ max(Y, N) = ante/n regardless of how extreme the prob is
      expect(Math.max(a.poolYes, a.poolNo)).toBeCloseTo(ante / n, 8)
      // all of the funded ante lands as liquidity — nothing discarded
      expect(a.totalLiquidity).toBeCloseTo(ante / n, 8)
    })
  })

  it('regression: Set with no initialProbs ⇒ v1 cpmm-multi-1, each answer 50%', () => {
    const ante = 1000
    const contract = makeMC(['A', 'B', 'C'], undefined, ante, false)
    expect(contract.mechanism).toBe('cpmm-multi-1')
    const n = contract.answers.length
    contract.answers.forEach((a) => {
      expect(a.prob).toBeCloseTo(0.5, 10)
      expect(a.p).toBe(0.5)
      expect(a.poolYes).toBeCloseTo(ante / n, 8)
      expect(a.poolNo).toBeCloseTo(ante / n, 8)
    })
  })
})

describe('cpmm-multi-2 created market — trades under the v2 arb (Σp = 1 held)', () => {
  const finalProbs = (
    res: ReturnType<typeof calculateCpmmMultiArbitrageYesBets>
  ) => {
    const all = [...res.newBetResults, ...res.otherBetResults]
    return sumBy(all, (r) => getCpmmProbability(r.cpmmState.pool, r.cpmmState.p))
  }

  it('single-answer YES buy on a v2 market keeps Σp = 1', () => {
    const answers = makeMC(['A', 'B', 'C'], [60, 30, 10]).answers
    const res = calculateCpmmMultiArbitrageYesBets(
      answers,
      [answers[0]],
      50,
      undefined,
      [],
      { creator1: 100000 },
      noFees,
      'cpmm-multi-2'
    )
    expect(finalProbs(res)).toBeCloseTo(1, 8)
    // YES buy on answer A moves its price up.
    const a = res.newBetResults.find((r) => r.answer.id === answers[0].id)!
    expect(getCpmmProbability(a.cpmmState.pool, a.cpmmState.p)).toBeGreaterThan(0.6)
  })

  it('multi-answer basket YES buy on a v2 market keeps Σp = 1 and spends the budget', () => {
    const answers = makeMC(['A', 'B', 'C', 'D'], [40, 30, 20, 10]).answers
    const bet = 80
    const res = calculateCpmmMultiArbitrageYesBets(
      answers,
      [answers[0], answers[1]],
      bet,
      undefined,
      [],
      { creator1: 100000 },
      noFees,
      'cpmm-multi-2'
    )
    expect(finalProbs(res)).toBeCloseTo(1, 6)
    // net taker spend across the basket equals the budget (no overshoot churn).
    const spent = sumBy(res.newBetResults, (r) => sumBy(r.takers, 'amount'))
    expect(spent).toBeCloseTo(bet, 4)
  })
})
