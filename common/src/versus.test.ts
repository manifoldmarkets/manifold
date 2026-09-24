import { Answer } from './answer'
import { Bet, LimitBet } from './bet'
import { CPMMMultiContract, Contract } from './contract'
import { ContractMetric } from './contract-metric'
import {
  getVersusAnswers,
  getVersusBetProbs,
  getVersusShares,
  mergeVersusMetricsByUser,
  partitionVersusBets,
  toMainAnswerMetric,
  toMainAnswerOrder,
  versusSide,
  versusSideOutcome,
  versusSideProb,
} from './versus'

const makeAnswer = (
  id: string,
  text: string,
  prob: number,
  index: number,
  extra: Partial<Answer> = {}
): Answer => ({
  id,
  index,
  contractId: 'c1',
  userId: 'u1',
  text,
  createdTime: 0,
  poolYes: 100,
  poolNo: 100,
  prob,
  totalLiquidity: 100,
  subsidyPool: 0,
  volume: 0,
  probChanges: { day: 0, week: 0, month: 0 },
  ...extra,
})

const home = makeAnswer('home', 'Home', 0.6, 0)
const away = makeAnswer('away', 'Away', 0.4, 1)

const versus = {
  id: 'c1',
  mechanism: 'cpmm-multi-1',
  outcomeType: 'MULTIPLE_CHOICE',
  shouldAnswersSumToOne: true,
  addAnswersMode: 'DISABLED',
  answers: [home, away],
} as unknown as CPMMMultiContract

const makeBet = (
  answerId: string | undefined,
  outcome: 'YES' | 'NO',
  extra: Partial<Bet> = {}
): Bet => ({
  id: 'b-' + answerId + outcome,
  userId: 'u1',
  contractId: 'c1',
  answerId,
  createdTime: 0,
  amount: 10,
  outcome,
  shares: 20,
  probBefore: 0.4,
  probAfter: 0.45,
  fees: { creatorFee: 0, platformFee: 0, liquidityFee: 0 },
  isRedemption: false,
  ...extra,
})

describe('getVersusAnswers', () => {
  it('returns the first answer as main and the second as other', () => {
    expect(getVersusAnswers(versus)).toEqual({ main: home, other: away })
  })

  it('is undefined for markets that are not versus markets', () => {
    expect(
      getVersusAnswers({
        ...versus,
        addAnswersMode: 'ANYONE',
      } as unknown as Contract)
    ).toBeUndefined()
    expect(
      getVersusAnswers({
        ...versus,
        shouldAnswersSumToOne: false,
      } as unknown as Contract)
    ).toBeUndefined()
    expect(
      getVersusAnswers({
        ...versus,
        answers: [home, away, makeAnswer('draw', 'Draw', 0, 2)],
      } as unknown as Contract)
    ).toBeUndefined()
    expect(
      getVersusAnswers({
        mechanism: 'cpmm-1',
        outcomeType: 'BINARY',
      } as unknown as Contract)
    ).toBeUndefined()
  })
})

describe('versusSide', () => {
  it('YES on the main answer backs the main answer', () => {
    const side = versusSide(versus, { answerId: 'home', outcome: 'YES' })!
    expect(side.answer).toBe(home)
    expect(side.opponent).toBe(away)
    expect(side.sideOutcome).toBe('YES')
    expect(side.isOnMainAnswer).toBe(true)
    expect(side.prob).toBe(0.6)
  })

  it('NO on the main answer backs the second answer', () => {
    const side = versusSide(versus, { answerId: 'home', outcome: 'NO' })!
    expect(side.answer).toBe(away)
    expect(side.opponent).toBe(home)
    expect(side.sideOutcome).toBe('NO')
    expect(side.isOnMainAnswer).toBe(true)
    expect(side.prob).toBe(0.4)
  })

  it('YES on the second answer backs the second answer', () => {
    const side = versusSide(versus, { answerId: 'away', outcome: 'YES' })!
    expect(side.answer).toBe(away)
    expect(side.opponent).toBe(home)
    expect(side.sideOutcome).toBe('NO')
    expect(side.isOnMainAnswer).toBe(false)
    expect(side.prob).toBe(0.4)
  })

  it('NO on the second answer backs the main answer', () => {
    const side = versusSide(versus, { answerId: 'away', outcome: 'NO' })!
    expect(side.answer).toBe(home)
    expect(side.opponent).toBe(away)
    expect(side.sideOutcome).toBe('YES')
    expect(side.isOnMainAnswer).toBe(false)
    expect(side.prob).toBe(0.6)
  })

  it('treats a bet without an answer id as a bet on the main answer', () => {
    expect(versusSide(versus, { outcome: 'YES' })?.sideOutcome).toBe('YES')
    expect(versusSide(versus, { outcome: 'NO' })?.sideOutcome).toBe('NO')
    expect(
      versusSide(versus, { answerId: null, outcome: 'NO' })?.isOnMainAnswer
    ).toBe(true)
  })

  it('is undefined for unknown answers and non-versus markets', () => {
    expect(
      versusSide(versus, { answerId: 'draw', outcome: 'YES' })
    ).toBeUndefined()
    expect(
      versusSide(
        { mechanism: 'cpmm-1', outcomeType: 'BINARY' } as unknown as Contract,
        { outcome: 'YES' }
      )
    ).toBeUndefined()
    expect(
      versusSideOutcome(versus, { answerId: 'away', outcome: 'YES' })
    ).toBe('NO')
  })

  it('uses the resolved probabilities on a resolved market', () => {
    const resolved = {
      ...versus,
      isResolved: true,
      resolution: 'home',
      resolutions: { home: 100 },
      answers: [
        { ...home, prob: 1, resolution: 'YES', resolutionProbability: 1 },
        { ...away, prob: 0, resolution: 'NO', resolutionProbability: 0 },
      ],
    } as unknown as CPMMMultiContract
    const backedHomeViaAway = versusSide(resolved, {
      answerId: 'away',
      outcome: 'NO',
    })!
    expect(backedHomeViaAway.answer.id).toBe('home')
    expect(backedHomeViaAway.sideOutcome).toBe('YES')
    expect(backedHomeViaAway.prob).toBe(1)
    const backedAway = versusSide(resolved, {
      answerId: 'away',
      outcome: 'YES',
    })!
    expect(backedAway.sideOutcome).toBe('NO')
    expect(backedAway.prob).toBe(0)
  })
})

describe('versusSideProb and getVersusBetProbs', () => {
  it('leaves YES prices alone and mirrors NO prices', () => {
    expect(versusSideProb('YES', 0.3)).toBe(0.3)
    expect(versusSideProb('NO', 0.3)).toBe(0.7)
  })

  it('gives the backed side probability for bets on either answer', () => {
    // A YES bet on the second answer moved its price from 40% to 45%.
    expect(getVersusBetProbs(makeBet('away', 'YES'))).toEqual({
      probBefore: 0.4,
      probAfter: 0.45,
      limitProb: undefined,
    })
    // A NO bet on the second answer at the same prices backs the main
    // answer, which went from 60% to 55%.
    const awayNo = getVersusBetProbs(makeBet('away', 'NO'))
    expect(awayNo.probBefore).toBeCloseTo(0.6)
    expect(awayNo.probAfter).toBeCloseTo(0.55)
    expect(awayNo.limitProb).toBeUndefined()
    // Same for bets on the main answer.
    const homeNo = getVersusBetProbs(
      makeBet('home', 'NO', { probBefore: 0.6, probAfter: 0.55 })
    )
    expect(homeNo.probBefore).toBeCloseTo(0.4)
    expect(homeNo.probAfter).toBeCloseTo(0.45)
    expect(homeNo.limitProb).toBeUndefined()
  })

  it('converts limit order prices', () => {
    const order = makeBet('away', 'NO', {
      limitProb: 0.3,
      orderAmount: 100,
      isFilled: false,
      isCancelled: false,
      fills: [],
    }) as LimitBet
    expect(getVersusBetProbs(order).limitProb).toBe(0.7)
    expect(getVersusBetProbs({ ...order, outcome: 'YES' }).limitProb).toBe(0.3)
  })

  it('treats sells (negative amounts) like the position they reduce', () => {
    const sell = makeBet('away', 'YES', {
      amount: -5,
      shares: -10,
      probBefore: 0.45,
      probAfter: 0.4,
    })
    expect(versusSide(versus, sell)?.answer.id).toBe('away')
    expect(versusSide(versus, sell)?.sideOutcome).toBe('NO')
    expect(getVersusBetProbs(sell)).toEqual({
      probBefore: 0.45,
      probAfter: 0.4,
      limitProb: undefined,
    })
  })
})

describe('toMainAnswerOrder', () => {
  it('keeps orders on the main answer as they are', () => {
    expect(
      toMainAnswerOrder(versus, {
        answerId: 'home',
        outcome: 'NO',
        limitProb: 0.3,
      })
    ).toEqual({ outcome: 'NO', limitProb: 0.3 })
    expect(
      toMainAnswerOrder(versus, {
        answerId: 'home',
        outcome: 'YES',
        limitProb: 0.3,
      })
    ).toEqual({ outcome: 'YES', limitProb: 0.3 })
  })

  it('mirrors orders on the second answer into the main answer frame', () => {
    // Buy Away at 30% == buy NO on Home at 70%.
    expect(
      toMainAnswerOrder(versus, {
        answerId: 'away',
        outcome: 'YES',
        limitProb: 0.3,
      })
    ).toEqual({ outcome: 'NO', limitProb: 0.7 })
    // Sell Away at 30% (NO on Away) == buy YES on Home at 70%.
    expect(
      toMainAnswerOrder(versus, {
        answerId: 'away',
        outcome: 'NO',
        limitProb: 0.3,
      })
    ).toEqual({ outcome: 'YES', limitProb: 0.7 })
  })

  it('is undefined for non-versus markets', () => {
    expect(
      toMainAnswerOrder(
        { mechanism: 'cpmm-1', outcomeType: 'BINARY' } as unknown as Contract,
        { outcome: 'YES', limitProb: 0.5 }
      )
    ).toBeUndefined()
  })

  it('groups equivalent orders at every supported limit price', () => {
    // OrderBookSide groups by the exact numeric limitProb. Complementing a
    // price such as 0.7 must produce the same key as a stored 0.3 order.
    for (let percent = 1; percent < 100; percent++) {
      for (const outcome of ['YES', 'NO'] as const) {
        const main = toMainAnswerOrder(versus, {
          answerId: 'home',
          outcome,
          limitProb: percent / 100,
        })!
        const other = toMainAnswerOrder(versus, {
          answerId: 'away',
          outcome: outcome === 'YES' ? 'NO' : 'YES',
          limitProb: (100 - percent) / 100,
        })!
        expect(other).toEqual(main)
        expect(new Set([main.limitProb, other.limitProb]).size).toBe(1)
      }
    }
  })
})

describe('partitionVersusBets', () => {
  it('groups bets by the side they back regardless of stored answer', () => {
    const bets = [
      makeBet('home', 'YES'),
      makeBet('home', 'NO'),
      makeBet('away', 'YES'),
      makeBet('away', 'NO'),
      makeBet(undefined, 'YES'),
    ]
    const [yesSide, noSide] = partitionVersusBets(versus, bets)
    expect(yesSide.map((b) => b.id)).toEqual([
      'b-homeYES',
      'b-awayNO',
      'b-undefinedYES',
    ])
    expect(noSide.map((b) => b.id)).toEqual(['b-homeNO', 'b-awayYES'])
  })
})

const makeMetric = (
  answerId: string | null,
  yes: number,
  no: number
): ContractMetric =>
  ({
    id: 1,
    userId: 'u1',
    contractId: 'c1',
    answerId,
    totalShares: { YES: yes, NO: no },
    totalSpent: { YES: yes / 2, NO: no / 2 },
    hasYesShares: yes >= 1,
    hasNoShares: no >= 1,
    hasShares: yes >= 1 || no >= 1,
    maxSharesOutcome: yes >= no ? 'YES' : 'NO',
    invested: 0,
    loan: 0,
    marginLoan: 0,
    payout: 0,
    profit: 0,
    profitPercent: 0,
    totalAmountInvested: 0,
    totalAmountSold: 0,
    lastBetTime: 0,
    lastProb: null,
    from: undefined,
  } as ContractMetric)

describe('getVersusShares', () => {
  it('sums shares across both answers relative to the main answer', () => {
    const shares = getVersusShares(versus, [
      makeMetric('home', 10, 0),
      makeMetric('away', 5, 3),
      // The summary metric mixes both answers and must be ignored.
      makeMetric(null, 15, 3),
    ])
    expect(shares.yesShares).toBe(13)
    expect(shares.noShares).toBe(5)
    expect(shares.hasYesShares).toBe(true)
    expect(shares.hasNoShares).toBe(true)
    expect(shares.sharesOutcome).toBe('YES')
  })

  it('reports a position held only through the second answer', () => {
    const shares = getVersusShares(versus, [makeMetric('away', 8, 0)])
    expect(shares).toEqual({
      yesShares: 0,
      noShares: 8,
      hasYesShares: false,
      hasNoShares: true,
      sharesOutcome: 'NO',
    })
  })

  it('handles no metrics', () => {
    expect(getVersusShares(versus, undefined).sharesOutcome).toBeUndefined()
    expect(getVersusShares(versus, []).yesShares).toBe(0)
  })
})

describe('toMainAnswerMetric', () => {
  it('mirrors a metric on the second answer', () => {
    const remapped = toMainAnswerMetric(versus, makeMetric('away', 5, 3))
    expect(remapped.answerId).toBe('home')
    expect(remapped.totalShares).toEqual({ YES: 3, NO: 5 })
    expect(remapped.totalSpent).toEqual({ YES: 1.5, NO: 2.5 })
    expect(remapped.hasYesShares).toBe(true)
    expect(remapped.hasNoShares).toBe(true)
    expect(remapped.maxSharesOutcome).toBe('NO')
  })

  it('returns metrics on the main answer unchanged', () => {
    const metric = makeMetric('home', 5, 3)
    expect(toMainAnswerMetric(versus, metric)).toBe(metric)
    const summary = makeMetric(null, 5, 3)
    expect(toMainAnswerMetric(versus, summary)).toBe(summary)
  })

  it.each([0, 0.4, 1])('mirrors a last trade probability of %s', (lastProb) => {
    const metric = { ...makeMetric('away', 5, 0), lastProb }
    const remapped = toMainAnswerMetric(versus, metric)
    expect(remapped.maxSharesOutcome).toBe('NO')
    expect(remapped.lastProb).toBeCloseTo(1 - lastProb)
    // The NO probability shown in the holder details is the Away price.
    expect(1 - remapped.lastProb!).toBeCloseTo(lastProb)
    expect(metric.lastProb).toBe(lastProb)
  })

  it('preserves a missing last trade probability', () => {
    expect(
      toMainAnswerMetric(versus, makeMetric('away', 5, 0)).lastProb
    ).toBeNull()
  })
})

describe('mergeVersusMetricsByUser', () => {
  it('lists a position on the second answer as a main-answer position', () => {
    const merged = mergeVersusMetricsByUser(versus, [
      { ...makeMetric('away', 8, 0), userId: 'u2' },
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].userId).toBe('u2')
    expect(merged[0].answerId).toBe('home')
    expect(merged[0].totalShares).toEqual({ YES: 0, NO: 8 })
    expect(merged[0].hasNoShares).toBe(true)
    expect(merged[0].hasYesShares).toBe(false)
    expect(merged[0].maxSharesOutcome).toBe('NO')
  })

  it('sums a user holding positions on both answers and drops summaries', () => {
    const merged = mergeVersusMetricsByUser(versus, [
      { ...makeMetric('home', 10, 0), profit: 5, invested: 20 },
      { ...makeMetric('away', 5, 3), profit: -1, invested: 4 },
      { ...makeMetric('away', 5, 3), profit: -1, invested: 4 }, // duplicate row
      makeMetric(null, 15, 3),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].totalShares).toEqual({ YES: 13, NO: 5 })
    expect(merged[0].profit).toBe(4)
    expect(merged[0].invested).toBe(24)
    expect(merged[0].hasYesShares).toBe(true)
    expect(merged[0].hasNoShares).toBe(true)
  })

  it('sums cost basis on each remapped side without changing the inputs', () => {
    const homeMetric = {
      ...makeMetric('home', 100, 50),
      totalSpent: { YES: 60, NO: 20 },
    }
    const awayMetric = {
      ...makeMetric('away', 50, 100),
      totalSpent: { YES: 30, NO: 60 },
    }
    const [merged] = mergeVersusMetricsByUser(versus, [
      homeMetric,
      awayMetric,
      awayMetric, // Duplicate pages must not double-count cost basis.
    ])
    expect(merged.totalShares).toEqual({ YES: 200, NO: 100 })
    expect(merged.totalSpent).toEqual({ YES: 120, NO: 50 })
    expect(merged.totalSpent!.YES / merged.totalShares.YES).toBe(0.6)
    expect(merged.totalSpent!.NO / merged.totalShares.NO).toBe(0.5)
    expect(homeMetric.totalSpent).toEqual({ YES: 60, NO: 20 })
    expect(awayMetric.totalSpent).toEqual({ YES: 30, NO: 60 })
  })

  it('keeps available cost basis when the other metric has none', () => {
    const homeMetric = { ...makeMetric('home', 0, 0), totalSpent: undefined }
    const awayMetric = makeMetric('away', 50, 100)
    for (const metrics of [
      [homeMetric, awayMetric],
      [awayMetric, homeMetric],
    ]) {
      expect(mergeVersusMetricsByUser(versus, metrics)[0].totalSpent).toEqual({
        YES: 50,
        NO: 25,
      })
    }
    expect(
      mergeVersusMetricsByUser(versus, [
        homeMetric,
        { ...awayMetric, totalSpent: undefined },
      ])[0].totalSpent
    ).toBeUndefined()
  })

  it.each(['home', 'away'])(
    'uses the latest trade probability when the newer metric is on %s',
    (newestAnswer) => {
      const homeMetric = {
        ...makeMetric('home', 100, 0),
        lastBetTime: newestAnswer === 'home' ? 200 : 100,
        lastProb: 0.7,
      }
      const awayMetric = {
        ...makeMetric('away', 100, 0),
        lastBetTime: newestAnswer === 'away' ? 200 : 100,
        lastProb: 0.4,
      }
      for (const metrics of [
        [homeMetric, awayMetric],
        [awayMetric, homeMetric],
      ]) {
        const [merged] = mergeVersusMetricsByUser(versus, metrics)
        expect(merged.lastBetTime).toBe(200)
        expect(merged.lastProb).toBeCloseTo(newestAnswer === 'home' ? 0.7 : 0.6)
      }
    }
  )

  it('does not associate an older probability with a newer trade lacking one', () => {
    const [merged] = mergeVersusMetricsByUser(versus, [
      { ...makeMetric('home', 100, 0), lastBetTime: 100, lastProb: 0.7 },
      { ...makeMetric('away', 100, 0), lastBetTime: 200, lastProb: null },
    ])
    expect(merged.lastBetTime).toBe(200)
    expect(merged.lastProb).toBeNull()
  })

  it('leaves non-versus markets alone', () => {
    const metrics = [makeMetric('home', 1, 0)]
    expect(
      mergeVersusMetricsByUser(
        { ...versus, addAnswersMode: 'ANYONE' } as unknown as Contract,
        metrics
      )
    ).toBe(metrics)
  })
})
