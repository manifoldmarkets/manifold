import { Answer } from './answer'
import { getAnswerProbability, getDisplayProbability } from './calculate'
import { BinaryContract, Contract, CPMMMultiContract } from './contract'
import {
  BetProbRow,
  buildMarketProbsHistory,
  contractAsOf,
  marketProbsAtFrame,
  probsHistoryFrameTimes,
} from './market-probs-history'

const bet = (
  createdTime: number,
  probBefore: number,
  probAfter: number,
  answerId: string | null = null,
  contractId = 'c1'
): BetProbRow => ({ contractId, answerId, createdTime, probBefore, probAfter })

const binary = (overrides: Partial<BinaryContract> = {}) =>
  ({
    id: 'c1',
    mechanism: 'cpmm-1',
    outcomeType: 'BINARY',
    pool: { YES: 100, NO: 300 },
    p: 0.5,
    prob: 0.75,
    createdTime: 0,
    isResolved: false,
    ...overrides,
  } as unknown as BinaryContract)

const answer = (id: string, overrides: Partial<Answer> = {}) =>
  ({
    id,
    contractId: 'm1',
    createdTime: 0,
    poolYes: 200,
    poolNo: 200,
    p: 0.5,
    prob: 0.5,
    ...overrides,
  } as Answer)

const multi = (answers: Answer[], overrides: Partial<CPMMMultiContract> = {}) =>
  ({
    id: 'm1',
    mechanism: 'cpmm-multi-1',
    outcomeType: 'MULTIPLE_CHOICE',
    shouldAnswersSumToOne: true,
    createdTime: 0,
    isResolved: false,
    answers,
    ...overrides,
  } as unknown as CPMMMultiContract)

describe('probsHistoryFrameTimes', () => {
  it('steps from start through now, inclusive', () => {
    expect(probsHistoryFrameTimes(0, 10, 30)).toEqual([0, 10, 20, 30])
    expect(probsHistoryFrameTimes(0, 10, 29)).toEqual([0, 10, 20])
  })

  it('is empty when start is after now', () => {
    expect(probsHistoryFrameTimes(40, 10, 30)).toEqual([])
  })
})

describe('buildMarketProbsHistory', () => {
  const times = [0, 10, 20, 30]

  it('opens at the first bet’s probBefore and follows probAfter', () => {
    const history = buildMarketProbsHistory(times, { c1: { prob: 0.7 } }, [
      bet(15, 0.4, 0.5),
      bet(25, 0.5, 0.7),
    ])
    expect(history.c1.prob).toEqual([
      [0, 0.4],
      [2, 0.5],
      [3, 0.7],
    ])
  })

  it('counts a bet placed exactly on a frame in that frame', () => {
    const history = buildMarketProbsHistory(times, { c1: { prob: 0.6 } }, [
      bet(10, 0.5, 0.6),
    ])
    expect(history.c1.prob).toEqual([
      [0, 0.5],
      [1, 0.6],
    ])
  })

  it('keeps a series with no bets at its current probability', () => {
    const history = buildMarketProbsHistory(times, { c1: { prob: 0.3 } }, [])
    expect(history.c1.prob).toEqual([[0, 0.3]])
  })

  it('orders bets by time, whatever order they arrive in', () => {
    const history = buildMarketProbsHistory(times, { c1: { prob: 0.7 } }, [
      bet(25, 0.5, 0.7),
      bet(15, 0.4, 0.5),
    ])
    expect(history.c1.prob?.[0]).toEqual([0, 0.4])
  })

  it('emits a point only when the rounded probability changes', () => {
    const history = buildMarketProbsHistory(times, { c1: { prob: 0.50001 } }, [
      bet(5, 0.5, 0.500001),
      bet(15, 0.500001, 0.50001),
    ])
    expect(history.c1.prob).toEqual([[0, 0.5]])
  })

  it('builds one series per answer from that answer’s bets', () => {
    const history = buildMarketProbsHistory(
      times,
      { m1: { answerProbs: { a: 0.6, b: 0.4 } } },
      [bet(15, 0.5, 0.6, 'a', 'm1'), bet(15, 0.5, 0.4, 'b', 'm1')]
    )
    expect(history.m1.prob).toBeUndefined()
    expect(history.m1.answerProbs).toEqual({
      a: [
        [0, 0.5],
        [2, 0.6],
      ],
      b: [
        [0, 0.5],
        [2, 0.4],
      ],
    })
  })

  it('ignores bets on markets or answers it was not asked about', () => {
    const history = buildMarketProbsHistory(
      times,
      { m1: { answerProbs: { a: 0.6 } } },
      [bet(15, 0.1, 0.2, 'gone', 'm1'), bet(15, 0.1, 0.2, null, 'other')]
    )
    expect(Object.keys(history)).toEqual(['m1'])
    expect(history.m1.answerProbs).toEqual({ a: [[0, 0.6]] })
  })

  it('gives the same history from one row per frame as from every bet', () => {
    // How the API folds bets in SQL: per frame, the first bet's probBefore
    // and the last bet's probAfter, placed at the frame's time.
    const bets = [
      bet(3, 0.5, 0.52),
      bet(9, 0.52, 0.48),
      bet(10, 0.48, 0.45),
      bet(14, 0.45, 0.6),
      bet(19, 0.6, 0.58),
      bet(33, 0.58, 0.7),
    ]
    const buckets = [
      bet(10, 0.5, 0.45),
      bet(20, 0.45, 0.58),
      bet(40, 0.58, 0.7),
    ]
    const current = { c1: { prob: 0.7 } }
    expect(buildMarketProbsHistory(times, current, buckets)).toEqual(
      buildMarketProbsHistory(times, current, bets)
    )
  })

  it('skips frames without a valid probability', () => {
    const history = buildMarketProbsHistory(times, { c1: { prob: 0.5 } }, [
      bet(5, NaN, NaN),
      bet(15, NaN, 0.5),
    ])
    expect(history.c1.prob).toEqual([[2, 0.5]])
    expect(
      buildMarketProbsHistory(times, { c1: { prob: undefined } }, []).c1.prob
    ).toBeUndefined()
  })
})

describe('marketProbsAtFrame', () => {
  const series = {
    prob: [
      [1, 0.4],
      [3, 0.6],
    ] as [number, number][],
  }

  it('holds the last point at or before the frame', () => {
    expect(marketProbsAtFrame(series, 1).prob).toBe(0.4)
    expect(marketProbsAtFrame(series, 2).prob).toBe(0.4)
    expect(marketProbsAtFrame(series, 3).prob).toBe(0.6)
  })

  it('has nothing before the first point', () => {
    expect(marketProbsAtFrame(series, 0).prob).toBeUndefined()
    expect(marketProbsAtFrame(undefined, 2).prob).toBeUndefined()
  })
})

describe('contractAsOf', () => {
  it('re-prices a binary market to the probability it had', () => {
    const live = binary()
    const past = contractAsOf(live, 50, { prob: 0.3 }) as BinaryContract
    expect(getDisplayProbability(past)).toBeCloseTo(0.3, 12)
    expect(past.prob).toBe(0.3)
    expect(past.pool).toEqual(live.pool)
    expect(getDisplayProbability(live)).toBeCloseTo(0.75, 12)
  })

  it('leaves a market without a probability for that time as it is', () => {
    const live = binary()
    expect(contractAsOf(live, 50, undefined)).toBe(live)
    expect(contractAsOf(live, 50, { prob: NaN })).toBe(live)
    expect(contractAsOf(live, 50, { prob: 1.5 })).toBe(live)
  })

  it('drops a market created after the time', () => {
    expect(
      contractAsOf(binary({ createdTime: 60 }), 50, { prob: 0.3 })
    ).toBeUndefined()
  })

  it('undoes a resolution that came later and keeps an earlier one', () => {
    const resolved = binary({
      isResolved: true,
      resolution: 'YES',
      resolutionTime: 100,
      resolutionProbability: 1,
      resolverId: 'u1',
    })
    const before = contractAsOf(resolved, 50, {
      prob: 0.8,
    }) as BinaryContract
    expect(before.isResolved).toBe(false)
    expect(before.resolution).toBeUndefined()
    expect(getDisplayProbability(before)).toBeCloseTo(0.8, 12)

    const after = contractAsOf(resolved, 150, {
      prob: 0.8,
    }) as BinaryContract
    expect(after.resolution).toBe('YES')
    expect(getDisplayProbability(after)).toBe(1)
  })

  it('re-prices each answer and drops answers added later', () => {
    const live = multi([
      answer('a', { prob: 0.5 }),
      answer('b', { prob: 0.5 }),
      answer('late', { createdTime: 80 }),
    ])
    const past = contractAsOf(live, 50, {
      answerProbs: { a: 0.7, b: 0.3, late: 0.1 },
    }) as CPMMMultiContract
    expect(past.answers.map((a) => a.id)).toEqual(['a', 'b'])
    expect(getAnswerProbability(past, 'a')).toBeCloseTo(0.7, 12)
    expect(getAnswerProbability(past, 'b')).toBeCloseTo(0.3, 12)
    expect(past.answers[0].prob).toBe(0.7)
    expect(live.answers).toHaveLength(3)
    expect(getAnswerProbability(live, 'a')).toBeCloseTo(0.5, 12)
  })

  it('keeps answers it has no probability for at their live values', () => {
    const live = multi([answer('a', { poolYes: 100, poolNo: 300 })])
    const past = contractAsOf(live, 50, { answerProbs: {} }) as Contract
    expect(getAnswerProbability(past as CPMMMultiContract, 'a')).toBeCloseTo(
      getAnswerProbability(live, 'a'),
      12
    )
  })

  it('undoes an answer resolution that came later', () => {
    const live = multi(
      [
        answer('a', { resolution: 'YES', resolutionTime: 100 }),
        answer('b', { resolution: 'NO', resolutionTime: 40 }),
      ],
      { shouldAnswersSumToOne: false }
    )
    const past = contractAsOf(live, 50, {
      answerProbs: { a: 0.9, b: 0.2 },
    }) as CPMMMultiContract
    expect(past.answers[0].resolution).toBeUndefined()
    expect(getAnswerProbability(past, 'a')).toBeCloseTo(0.9, 12)
    expect(past.answers[1].resolution).toBe('NO')
    expect(getAnswerProbability(past, 'b')).toBe(0)
  })
})
