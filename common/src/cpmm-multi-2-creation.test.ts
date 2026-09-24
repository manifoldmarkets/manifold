import { sumBy } from 'lodash'
import { Answer } from './answer'
import {
  cpmmMulti2MaxDepthPools,
  cpmmMulti2SumToOneCreationPools,
  cpmmMulti2SumToOneFeasible,
  cpmmMulti2SumToOnePools,
  getCpmmProbability,
} from './calculate-cpmm'
import {
  calculateCpmmMultiArbitrageBet,
  calculateCpmmMultiArbitrageYesBets,
} from './calculate-cpmm-arbitrage'
import { CPMMMulti } from './contract'
import { noFees } from './fees'
import { getAnswerProbsError, getNewContract } from './new-contract'
import { User } from './user'

// cpmm-multi-2 (PR2c) — creation path: per-answer `answerProbs` produce a
// `cpmm-multi-2` market at the requested probabilities, with the same ante budget
// v1 uses (no house risk). Sum-to-one markets use the √variance creation rule
// (pool depth W_i ∝ √(q_i(1-q_i)); reduces to v1 exactly at uniform, balanced only
// at n=2; see tasks/cpmm_multi_2/creation-liquidity-findings.md, GP13-GP15).
// Independent ("Set") markets stay balanced (= binary CPMM, optimal per-answer).
// Verified at jest level (no running dev instance): the created answers are then
// fed straight into the v2 multi-buy arb to confirm they trade and hold Σp = 1.

const creator = {
  id: 'creator1',
  name: 'Creator',
  username: 'creator',
  avatarUrl: '',
  createdTime: 0,
} as User

const makeMC = (
  answers: string[],
  answerProbs: number[] | undefined,
  ante = 1000,
  shouldAnswersSumToOne = true,
  addAnswersMode: 'DISABLED' | 'ONLY_CREATOR' | 'ANYONE' = 'DISABLED',
  cpmmMulti2Enabled = true
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
    addAnswersMode,
    shouldAnswersSumToOne,
    answerProbs,
    cpmmMulti2Enabled,
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
  sumBy(answers, (a) =>
    getCpmmProbability({ YES: a.poolYes, NO: a.poolNo }, a.p)
  )

// Point liquidity a = dprob/dshares = q(1-q)/W, W = (1-p)Y + pN (GP13). Lower =
// more liquid. W is the per-answer depth the √variance rule allocates.
const depthW = (a: Answer) => (1 - a.p) * a.poolYes + a.p * a.poolNo
const pointLiq = (a: Answer) => {
  const q = getCpmmProbability({ YES: a.poolYes, NO: a.poolNo }, a.p)
  return (q * (1 - q)) / depthW(a)
}

describe('cpmm-multi-2 creation — per-answer answerProbs', () => {
  it('cpmm-multi-2 mechanism; prob_i = normalized target; funds exactly (no house risk)', () => {
    const ante = 1200
    const contract = makeMC(['A', 'B', 'C'], [60, 30, 10], ante)
    expect(contract.mechanism).toBe('cpmm-multi-2')

    const targets = [0.6, 0.3, 0.1]
    contract.answers.forEach((a, i) => {
      // The displayed prob is exact regardless of pool shape: p carries the
      // target, so getCpmmProbability(pool, p) == target even when Y != N.
      expect(
        getCpmmProbability({ YES: a.poolYes, NO: a.poolNo }, a.p)
      ).toBeCloseTo(targets[i], 10)
      expect(a.prob).toBeCloseTo(targets[i], 10)
    })

    // Σ prob = 1 exactly.
    expect(sumProbs(contract.answers)).toBeCloseTo(1, 10)

    // No house risk: when any answer wins, payout = poolYes_i + Σ_{j≠i} poolNo_j,
    // which equals the ante for every i (all-winners-tight; the same budget v1 uses).
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

  it('uniform sum-to-one answerProbs reduce to v1 pools exactly', () => {
    // Equal targets ⇒ the √variance rule coincides with v1's construction.
    const ante = 1000
    const contract = makeMC(['A', 'B', 'C'], [1, 1, 1], ante)
    expect(contract.mechanism).toBe('cpmm-multi-2')
    const n = contract.answers.length
    contract.answers.forEach((a) => {
      expect(a.poolYes).toBeCloseTo(ante / 2, 6)
      expect(a.poolNo).toBeCloseTo(ante / (2 * n - 2), 6)
      expect(a.p).toBeCloseTo(0.5, 8)
      expect(
        getCpmmProbability({ YES: a.poolYes, NO: a.poolNo }, a.p)
      ).toBeCloseTo(1 / n, 10)
    })
  })

  it('skewed sum-to-one is asymmetric and more liquid than balanced', () => {
    const ante = 1000
    const contract = makeMC(['A', 'B', 'C'], [60, 25, 15], ante)
    const ans = contract.answers
    const n = ans.length

    // Not the balanced pool: the √variance shape is asymmetric for n>=3 skew.
    expect(Math.abs(ans[0].poolYes - ans[0].poolNo)).toBeGreaterThan(1)

    // More liquid: total point-liquidity beats the balanced construction (W=ante/n)
    // at the same probabilities (lower Σ a_i = more liquid).
    const L = ante / n
    const sqrtVarSum = sumBy(ans, pointLiq)
    const balancedSum = sumBy(ans, (a) => {
      const q = getCpmmProbability({ YES: a.poolYes, NO: a.poolNo }, a.p)
      return (q * (1 - q)) / L
    })
    expect(sqrtVarSum).toBeLessThan(balancedSum)

    // Depth follows √variance: higher-variance (mid-prob) answers are deeper.
    // q = [0.6, 0.25, 0.15] ⇒ variance order A > B > C.
    expect(depthW(ans[0])).toBeGreaterThan(depthW(ans[1]))
    expect(depthW(ans[1])).toBeGreaterThan(depthW(ans[2]))

    // Still funds exactly (no house risk).
    ans.forEach((a, i) => {
      const payout =
        a.poolYes +
        sumBy(
          ans.filter((_, j) => j !== i),
          (o) => o.poolNo
        )
      expect(payout).toBeCloseTo(ante, 6)
    })
  })

  it('normalizes answerProbs that do not sum to 100', () => {
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

  it('regression: no answerProbs ⇒ frozen v1 cpmm-multi-1, uniform 1/n', () => {
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
// so per-answer answerProbs are ABSOLUTE (no Σ=1 normalization). Same balanced
// deep pool + per-answer p representation as sum-to-one — required so the LP's
// max loss = max(Y, N) = ante/n stays funded for any target prob (an asymmetric
// p=0.5 pool would blow up max(Y,N) at the extremes ⇒ discard shares or house
// risk; see tasks/cpmm_multi_2 math TODO).
describe('cpmm-multi-2 creation — independent ("Set") absolute probs', () => {
  const independent = (answers: string[], answerProbs: number[], ante = 1000) =>
    makeMC(answers, answerProbs, ante, false).answers

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
    // Compare the displayed probs: under √variance the sum-to-one `p` field
    // carries the skew (p ≠ prob), so compare getCpmmProbability, not raw `p`.
    const probOf = (a: Answer) =>
      getCpmmProbability({ YES: a.poolYes, NO: a.poolNo }, a.p)
    // Set: absolute 0.40 / 0.20 / 0.10 (balanced ⇒ prob = p).
    expect(set.map(probOf)).toEqual([
      expect.closeTo(0.4, 10),
      expect.closeTo(0.2, 10),
      expect.closeTo(0.1, 10),
    ])
    // sum-to-one: normalized 4/7 / 2/7 / 1/7 (carried by the √variance pools).
    expect(s2o.map(probOf)).toEqual([
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

  it('regression: Set with no answerProbs ⇒ v1 cpmm-multi-1, each answer 50%', () => {
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
    return sumBy(all, (r) =>
      getCpmmProbability(r.cpmmState.pool, r.cpmmState.p)
    )
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
    expect(getCpmmProbability(a.cpmmState.pool, a.cpmmState.p)).toBeGreaterThan(
      0.6
    )
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

describe('cpmm-multi-2 creation — odds the √variance shape cannot hold', () => {
  // 50 answers: a 45% favourite and a long tail near the 1% floor. The √variance
  // closed form has no sane pools here (GP19a), so creation solves the same shape
  // exactly instead of refusing the odds.
  const answers = Array.from({ length: 50 }, (_, i) => `A${i}`)
  const answerProbs = [45, ...Array(49).fill(55 / 49)]
  const ante = 13000

  it('uses a vector the √variance construction rejects', () => {
    expect(cpmmMulti2SumToOneFeasible(answerProbs.map((x) => x / 100))).toBe(
      false
    )
  })

  it('still opens every answer at its target without losing any of the ante', () => {
    const contract = makeMC(answers, answerProbs, ante)
    expect(contract.mechanism).toBe('cpmm-multi-2')
    contract.answers.forEach((a, i) => {
      expect(a.poolYes).toBeGreaterThan(0)
      expect(a.poolNo).toBeGreaterThan(0)
      expect(a.p).toBeGreaterThan(0)
      expect(a.p).toBeLessThan(1)
      expect(
        getCpmmProbability({ YES: a.poolYes, NO: a.poolNo }, a.p)
      ).toBeCloseTo(answerProbs[i] / 100, 10)
    })
    expect(sumProbs(contract.answers)).toBeCloseTo(1, 10)
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
})

describe('which markets starting probabilities open as cpmm-multi-2', () => {
  it('keeps markets that can gain answers on cpmm-multi-1', () => {
    const contract = makeMC(['A', 'B'], [60, 30], 1000, true, 'ANYONE')
    expect(contract.mechanism).toBe('cpmm-multi-1')
  })

  it('refuses starting probabilities on them while cpmm-multi-2 is on', () => {
    const props = {
      answerProbs: [60, 30],
      numAnswers: 2,
      shouldAnswersSumToOne: true,
      hasOtherAnswer: true,
      addAnswersMode: 'ANYONE' as const,
    }
    expect(
      getAnswerProbsError({ ...props, cpmmMulti2Enabled: true })
    ).toContain('added later')
    // With it off they get cpmm-multi-1's lossy seeding, as before.
    expect(
      getAnswerProbsError({ ...props, cpmmMulti2Enabled: false })
    ).toBeUndefined()
  })

  it('falls back to cpmm-multi-1 seeding when cpmm-multi-2 is off', () => {
    const contract = makeMC(
      ['A', 'B', 'C'],
      [60, 30, 10],
      1000,
      true,
      'DISABLED',
      false
    )
    expect(contract.mechanism).toBe('cpmm-multi-1')
    contract.answers.forEach((a) => expect(a.p).toBe(0.5))
    contract.answers.forEach((a, i) =>
      expect(a.prob).toBeCloseTo([0.6, 0.3, 0.1][i], 10)
    )
  })

  it('records where each answer opened, for the chart', () => {
    const contract = makeMC(['A', 'B', 'C'], [60, 30, 10]) as CPMMMulti & {
      initialProbabilities?: { [answerId: string]: number }
    }
    contract.answers.forEach((a, i) =>
      expect(contract.initialProbabilities?.[a.id]).toBeCloseTo(
        [0.6, 0.3, 0.1][i],
        10
      )
    )
  })
})

describe('cpmm-multi-2 creation — long shots near the √variance edge', () => {
  // 30 answers with a 58.5% favourite: the √variance pools still exist, but
  // leave each 1.43% answer a fraction of a percent of the depth they aim for.
  const n = 30
  const q = [0.585, ...Array(n - 1).fill(0.415 / (n - 1))]
  const ante = 1000
  const depth = (x: { poolYes: number; poolNo: number; p: number }) =>
    (1 - x.p) * x.poolYes + x.p * x.poolNo

  it('solves the √variance shape exactly there instead', () => {
    expect(cpmmMulti2SumToOneFeasible(q)).toBe(true)
    const starved = cpmmMulti2SumToOnePools(q, ante)
    expect(depth(starved[1])).toBeLessThan((ante / n) * 0.05)
    expect(cpmmMulti2SumToOneCreationPools(q, ante)).toEqual(
      cpmmMulti2MaxDepthPools(q, ante)
    )
  })

  it("so Ṁ1 can't move a long shot far", () => {
    const answers = cpmmMulti2SumToOneCreationPools(q, ante).map(
      (x, i) =>
        ({
          id: `a${i}`,
          contractId: 'c',
          poolYes: x.poolYes,
          poolNo: x.poolNo,
          p: x.p,
          prob: x.prob,
        } as Answer)
    )
    const { newBetResult } = calculateCpmmMultiArbitrageBet(
      answers,
      answers[1],
      'YES',
      1,
      undefined,
      [],
      {},
      noFees
    )
    const after = getCpmmProbability(
      newBetResult.cpmmState.pool,
      newBetResult.cpmmState.p
    )
    // Evan's pools here move it from 1.4% to 36%.
    expect(after).toBeLessThan(0.025)
  })

  it('keeps the √variance pools where they deliver the depth they aim for', () => {
    for (const probs of [
      [0.6, 0.25, 0.15],
      [0.9, 0.05, 0.03, 0.02],
      [0.3, ...Array(19).fill(0.7 / 19)],
    ]) {
      expect(cpmmMulti2SumToOneCreationPools(probs, ante)).toEqual(
        cpmmMulti2SumToOnePools(probs, ante)
      )
    }
  })

  it('falls back for two front-runners and a few long shots, too', () => {
    // No √variance pools exist at all for this 7-answer market, and the
    // 6-answer one leaves its 1% answers about 5% of their target depth.
    const seven = [0.502, 0.435, 0.02, 0.013, 0.01, 0.01, 0.01]
    expect(cpmmMulti2SumToOneFeasible(seven)).toBe(false)
    expect(cpmmMulti2SumToOneCreationPools(seven, ante)).toEqual(
      cpmmMulti2MaxDepthPools(seven, ante)
    )
    const six = [0.492, 0.468, 0.01, 0.01, 0.01, 0.01]
    expect(cpmmMulti2SumToOneFeasible(six)).toBe(true)
    expect(cpmmMulti2SumToOneCreationPools(six, ante)).toEqual(
      cpmmMulti2MaxDepthPools(six, ante)
    )
  })

  it('reduces the exact pools to v1 at uniform odds', () => {
    for (const m of [2, 3, 10]) {
      cpmmMulti2MaxDepthPools(Array(m).fill(1 / m), ante).forEach((x) => {
        expect(x.poolYes).toBeCloseTo(ante / 2, 3)
        expect(x.poolNo).toBeCloseTo(ante / (2 * m - 2), 3)
        expect(x.p).toBeCloseTo(0.5, 6)
      })
    }
  })

  it('gives every answer depth in proportion to √(q(1 − q)), at least as deep as balanced pools', () => {
    for (const probs of [
      q,
      [0.502, 0.435, 0.02, 0.013, 0.01, 0.01, 0.01],
      [0.776, ...Array(19).fill(0.224 / 19)],
    ]) {
      const shape = probs.map((x) => Math.sqrt(x * (1 - x)))
      const scale = cpmmMulti2MaxDepthPools(probs, ante).map(
        (x, i) => depth(x) / shape[i]
      )
      scale.forEach((c) => expect(c).toBeCloseTo(scale[0], 8))
      // Balanced pools (D = 0) always fund; the search can only deepen them.
      expect(scale[0]).toBeGreaterThanOrEqual(
        ante / sumBy(shape, (x) => x) - 1e-9
      )
    }
  })

  it('keeps a favourite deep enough to trade against its long shots', () => {
    // A 77.6% favourite with 19 long shots, where the closed form starves the
    // long shots. Pools that price the favourite at p near 1 leave it a
    // fraction of a long shot's depth (a twelfth, at p = 0.985), and a big
    // enough bet on a long shot then drains it to 0%.
    const probs = [0.776, ...Array(19).fill(0.224 / 19)]
    const pools = cpmmMulti2SumToOneCreationPools(probs, 10_000)
    expect(pools[0].p).toBeLessThan(0.9)
    expect(depth(pools[0])).toBeGreaterThan(depth(pools[1]))
    const answers = pools.map(
      (x, i) =>
        ({
          id: `a${i}`,
          contractId: 'c',
          poolYes: x.poolYes,
          poolNo: x.poolNo,
          p: x.p,
          prob: x.prob,
        } as Answer)
    )
    const { newBetResult, otherBetResults } = calculateCpmmMultiArbitrageBet(
      answers,
      answers[1],
      'YES',
      4358,
      undefined,
      [],
      {},
      noFees
    )
    for (const r of [newBetResult, ...otherBetResults]) {
      expect(r.cpmmState.pool.YES).toBeGreaterThan(1)
      expect(r.cpmmState.pool.NO).toBeGreaterThan(1)
    }
  })

  it('always opens sane, exact and lossless, whichever pools it picks', () => {
    let seed = 7
    const random = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let trial = 0; trial < 300; trial++) {
      const m = 2 + Math.floor(random() * 60)
      const weights = Array.from({ length: m }, () => random() ** 4)
      const total = weights.reduce((a, b) => a + b, 0)
      // Keep every answer at 1% or more, as validation does.
      const floor = 0.01
      if (m * floor > 1) continue
      const probs = weights.map((w) => floor + (w / total) * (1 - m * floor))
      const pools = cpmmMulti2SumToOneCreationPools(probs, ante)
      const totalNo = pools.reduce((a, x) => a + x.poolNo, 0)
      pools.forEach((x, i) => {
        expect(x.poolYes).toBeGreaterThan(0)
        expect(x.poolNo).toBeGreaterThan(0)
        expect(x.p).toBeGreaterThan(0.001)
        expect(x.p).toBeLessThan(0.999)
        expect(
          getCpmmProbability({ YES: x.poolYes, NO: x.poolNo }, x.p)
        ).toBeCloseTo(probs[i], 9)
        expect(x.poolYes + totalNo - x.poolNo).toBeCloseTo(ante, 6)
      })
    }
  })
})
