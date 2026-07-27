import { Answer } from './answer'
import { Contract } from './contract'
import { getBinaryMCDisplayOutcome, isFlippedBinaryMCAnswer } from './contract'
import {
  ContractMetric,
  combineContractMetrics,
  flipContractMetricSides,
} from './contract-metric'

const getAnswer = (id: string, index: number, prob: number) =>
  ({
    id,
    index,
    contractId: 'c1',
    userId: 'creator',
    text: `answer ${id}`,
    createdTime: 0,
    poolYes: 100,
    poolNo: 100,
    prob,
    totalLiquidity: 50,
    subsidyPool: 0,
  } as Answer)

// answers[0] is the side the versus UI calls YES.
const MAIN = getAnswer('main', 0, 0.11)
const OTHER = getAnswer('other', 1, 0.89)

const versusContract = {
  id: 'c1',
  mechanism: 'cpmm-multi-1',
  outcomeType: 'MULTIPLE_CHOICE',
  addAnswersMode: 'DISABLED',
  shouldAnswersSumToOne: true,
  answers: [MAIN, OTHER],
} as any as Contract

const threeAnswerContract = {
  ...(versusContract as any),
  answers: [MAIN, OTHER, getAnswer('third', 2, 0.1)],
} as any as Contract

const getMetric = (over: Partial<ContractMetric>) =>
  ({
    id: 1,
    userId: 'u1',
    contractId: 'c1',
    answerId: null,
    lastBetTime: 0,
    lastProb: 0.5,
    hasNoShares: false,
    hasShares: true,
    hasYesShares: false,
    invested: 0,
    loan: 0,
    marginLoan: 0,
    maxSharesOutcome: null,
    totalShares: { YES: 0, NO: 0 },
    totalSpent: { YES: 0, NO: 0 },
    payout: 0,
    totalAmountSold: 0,
    totalAmountInvested: 0,
    profit: 0,
    profitPercent: 0,
    from: undefined,
    ...over,
  } as ContractMetric)

describe('getBinaryMCDisplayOutcome', () => {
  it('leaves bets on the main answer alone', () => {
    expect(getBinaryMCDisplayOutcome(versusContract, MAIN.id, 'YES')).toBe(
      'YES'
    )
    expect(getBinaryMCDisplayOutcome(versusContract, MAIN.id, 'NO')).toBe('NO')
  })

  it('flips bets placed on the other answer', () => {
    // Betting NO on the non-main answer is the same side as YES on the main
    // one; the versus UI has to show it as the main answer's side.
    expect(getBinaryMCDisplayOutcome(versusContract, OTHER.id, 'NO')).toBe(
      'YES'
    )
    expect(getBinaryMCDisplayOutcome(versusContract, OTHER.id, 'YES')).toBe(
      'NO'
    )
  })

  it('leaves non-versus multiple choice markets alone', () => {
    expect(getBinaryMCDisplayOutcome(threeAnswerContract, OTHER.id, 'NO')).toBe(
      'NO'
    )
    expect(isFlippedBinaryMCAnswer(threeAnswerContract, OTHER.id)).toBe(false)
  })

  it('reports which answers need flipping', () => {
    expect(isFlippedBinaryMCAnswer(versusContract, MAIN.id)).toBe(false)
    expect(isFlippedBinaryMCAnswer(versusContract, OTHER.id)).toBe(true)
    expect(isFlippedBinaryMCAnswer(versusContract, null)).toBe(false)
  })
})

describe('flipContractMetricSides', () => {
  it('restates a position on the other answer in the main answer frame', () => {
    // The reported case: 201.69 NO shares held on the non-main answer.
    const held = getMetric({
      answerId: OTHER.id,
      hasNoShares: true,
      maxSharesOutcome: 'NO',
      totalShares: { YES: 0, NO: 201.69 },
      totalSpent: { YES: 0, NO: 22.84 },
      lastProb: 0.89,
      invested: 22.84,
      profit: -20.34,
    })

    const flipped = flipContractMetricSides(held, MAIN.id)

    expect(flipped.answerId).toBe(MAIN.id)
    expect(flipped.totalShares).toEqual({ YES: 201.69, NO: 0 })
    expect(flipped.totalSpent).toEqual({ YES: 22.84, NO: 0 })
    expect(flipped.hasYesShares).toBe(true)
    expect(flipped.hasNoShares).toBe(false)
    expect(flipped.maxSharesOutcome).toBe('YES')
    expect(flipped.lastProb).toBeCloseTo(0.11)
    // Side-agnostic figures must survive untouched.
    expect(flipped.invested).toBe(22.84)
    expect(flipped.profit).toBe(-20.34)
  })

  it('round trips', () => {
    const held = getMetric({
      answerId: OTHER.id,
      hasYesShares: true,
      maxSharesOutcome: 'YES',
      totalShares: { YES: 10, NO: 3 },
      lastProb: 0.4,
    })
    const there = flipContractMetricSides(held, MAIN.id)
    const back = flipContractMetricSides(there, OTHER.id)
    expect(back.totalShares).toEqual(held.totalShares)
    expect(back.maxSharesOutcome).toBe(held.maxSharesOutcome)
    expect(back.lastProb).toBeCloseTo(held.lastProb!)
  })
})

describe('combineContractMetrics', () => {
  it('sums two sides of the same market once they share a frame', () => {
    const onMain = getMetric({
      answerId: MAIN.id,
      hasYesShares: true,
      maxSharesOutcome: 'YES',
      totalShares: { YES: 30, NO: 0 },
      totalSpent: { YES: 12, NO: 0 },
      invested: 12,
      profit: 3,
      lastBetTime: 100,
    })
    const onOther = flipContractMetricSides(
      getMetric({
        answerId: OTHER.id,
        hasNoShares: true,
        maxSharesOutcome: 'NO',
        totalShares: { YES: 0, NO: 70 },
        totalSpent: { YES: 0, NO: 28 },
        invested: 28,
        profit: -3,
        lastBetTime: 200,
      }),
      MAIN.id
    )

    const combined = combineContractMetrics(onMain, onOther)

    expect(combined.totalShares).toEqual({ YES: 100, NO: 0 })
    expect(combined.totalSpent).toEqual({ YES: 40, NO: 0 })
    expect(combined.invested).toBe(40)
    expect(combined.profit).toBe(0)
    expect(combined.profitPercent).toBe(0)
    expect(combined.hasYesShares).toBe(true)
    expect(combined.hasNoShares).toBe(false)
    expect(combined.maxSharesOutcome).toBe('YES')
    expect(combined.lastBetTime).toBe(200)
  })

  it('nets a hedged trader down to their real exposure', () => {
    // YES on both answers is YES + NO once stated in one frame.
    const onMain = getMetric({
      answerId: MAIN.id,
      hasYesShares: true,
      maxSharesOutcome: 'YES',
      totalShares: { YES: 40, NO: 0 },
      invested: 10,
      profit: 1,
    })
    const onOther = flipContractMetricSides(
      getMetric({
        answerId: OTHER.id,
        hasYesShares: true,
        maxSharesOutcome: 'YES',
        totalShares: { YES: 15, NO: 0 },
        invested: 5,
        profit: 1,
      }),
      MAIN.id
    )

    const combined = combineContractMetrics(onMain, onOther)

    expect(combined.totalShares).toEqual({ YES: 40, NO: 15 })
    expect(combined.hasYesShares).toBe(true)
    expect(combined.hasNoShares).toBe(true)
    expect(combined.maxSharesOutcome).toBe('YES')
    expect(combined.invested).toBe(15)
    expect(combined.profitPercent).toBeCloseTo((2 / 15) * 100)
  })
})
