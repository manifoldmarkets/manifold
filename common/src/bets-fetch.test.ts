import { Answer } from './answer'
import { getBetPointsAndLatestBetTime, getBetPointsBetween } from './bets'
import { MultiContract } from './contract'
import {
  CoveredMultiPoints,
  getKnownStepValueAt,
  getWholeHistoryCoverage,
  widerHistory,
} from './multi-chart'
import { unauthedApi } from './util/api'
import { HOUR_MS } from './util/time'

// getBetPointsBetween against a stand-in for the bet-points endpoint, to pin
// what it asks for and how it reads the answer.
jest.mock('common/util/api', () => ({ unauthedApi: jest.fn() }))
const mockApi = unauthedApi as unknown as jest.Mock

// A bet as the database holds it. `at` is in milliseconds and may carry a
// fraction: the column has microsecond precision.
type StoredBet = {
  at: number
  answerId: string
  probBefore: number
  probAfter: number
}
type Request = { afterTime: number; beforeTime: number; limit: number }

// Answers the way the endpoint does: both ends exclusive, compared at full
// precision, at most `limit` rows, times returned in whole milliseconds.
// `asOf`: serve only the bets made by then, as a reused response would.
const serve = (bets: StoredBet[], asOf = Infinity) => {
  const requests: Request[] = []
  mockApi.mockImplementation(async (_path: string, params: Request) => {
    requests.push(params)
    return bets
      .filter(
        (b) =>
          b.at <= asOf && b.at > params.afterTime && b.at < params.beforeTime
      )
      .slice(0, params.limit)
      .map(({ at, ...rest }) => ({ ...rest, createdTime: Math.floor(at) }))
  })
  return requests
}

const noon = Date.parse('2026-11-05T12:00:00Z')

// A cpmm-multi-1 answer (p = 0.5) whose pool gives exactly `prob`.
const makeAnswer = (id: string, prob: number): Answer => ({
  id,
  index: 0,
  contractId: 'c1',
  userId: 'u1',
  text: `Answer ${id}`,
  createdTime: noon - 100 * 24 * HOUR_MS,
  poolYes: 100 * (1 - prob),
  poolNo: 100 * prob,
  p: 0.5,
  prob,
  totalLiquidity: 100,
  subsidyPool: 0,
  volume: 0,
  probChanges: { day: 0, week: 0, month: 0 },
})

const makeContract = (answers: Answer[], lastBetTime: number) =>
  ({
    id: 'c1',
    mechanism: 'cpmm-multi-1',
    outcomeType: 'MULTIPLE_CHOICE',
    shouldAnswersSumToOne: false,
    addAnswersMode: 'ANYONE',
    createdTime: noon - 100 * 24 * HOUR_MS,
    lastBetTime,
    answers,
  } as unknown as MultiContract)

const lineOf = (
  points: { x: number; y: number; answerId: string | undefined }[],
  answerId: string
) =>
  points
    .filter((p) => p.answerId === answerId)
    .sort((a, b) => a.x - b.x)
    .map((p) => [p.x, p.y])

describe('getBetPointsBetween', () => {
  // 10:00 to 18:00:01, which the fetch splits on the hour at 12:00.
  const lastBetTime = noon + 6 * HOUR_MS
  const window = {
    afterTime: noon - 2 * HOUR_MS,
    beforeTime: lastBetTime + 1000,
  }

  beforeEach(() => mockApi.mockReset())

  it('asks for a long window in two halves, each with an explicit limit', async () => {
    const requests = serve([])
    await getBetPointsBetween(
      makeContract([makeAnswer('a', 0.9)], lastBetTime),
      window
    )
    expect(requests).toHaveLength(2)
    expect(requests.every((r) => r.limit === 5000)).toBe(true)
    expect(requests.map((r) => r.beforeTime).sort()).toEqual([
      noon,
      window.beforeTime,
    ])
  })

  it('does not lose a bet made exactly on the split', async () => {
    // The answer's only move, 50% to 90%, at 12:00:00.000. With both halves
    // exclusive at the split it was in neither, and the line then started
    // flat at 90%.
    serve([{ at: noon, answerId: 'a', probBefore: 0.5, probAfter: 0.9 }])
    const points = await getBetPointsBetween(
      makeContract([makeAnswer('a', 0.9)], noon),
      window
    )
    expect(lineOf(points, 'a')).toEqual([
      [window.afterTime, 0.5],
      [noon, 0.9],
    ])
  })

  it('counts a bet that comes back in both halves once', async () => {
    // Half a millisecond before the split: after the recent half's start and
    // before the historical half's end, so both return it.
    const requests = serve([
      { at: noon - 0.5, answerId: 'a', probBefore: 0.5, probAfter: 0.9 },
      { at: noon + 5, answerId: 'a', probBefore: 0.9, probAfter: 0.8 },
    ])
    const points = await getBetPointsBetween(
      makeContract([makeAnswer('a', 0.8)], noon + 5),
      window
    )
    expect(requests).toHaveLength(2)
    expect(lineOf(points, 'a')).toEqual([
      [window.afterTime, 0.5],
      [noon - 1, 0.9],
      [noon + 5, 0.8],
    ])
  })

  it('places a quiet answer at its current level only when no request hit its limit', async () => {
    // `count` bets on one answer, a millisecond apart, the last of them the
    // market's last bet.
    const crowd = (count: number): StoredBet[] =>
      Array.from({ length: count }, (_, i) => ({
        at: lastBetTime - (count - 1) + i,
        answerId: 'busy',
        probBefore: 0.5,
        probAfter: 0.5,
      }))
    const contract = makeContract(
      [makeAnswer('busy', 0.5), makeAnswer('quiet', 0.9)],
      lastBetTime
    )

    // Every bet of the window came back, none on `quiet`: it has not moved.
    serve(crowd(4999))
    expect(
      lineOf(await getBetPointsBetween(contract, window), 'quiet')
    ).toEqual([[window.afterTime, 0.9]])

    // One half came back as long as its limit. A bet on `quiet` may have been
    // cut off, so its current level says nothing about the window's start.
    serve(crowd(5000))
    expect(
      lineOf(await getBetPointsBetween(contract, window), 'quiet')
    ).toEqual([])
  })

  it('does not place a quiet answer from a reused response that predates the last bet', async () => {
    // `moved` went from 50% to 90% at 18:00. The response was made at 17:00
    // and is served again. Both halves are complete, and it proves nothing.
    const bets = [
      { at: noon + HOUR_MS, answerId: 'busy', probBefore: 0.4, probAfter: 0.5 },
      { at: lastBetTime, answerId: 'moved', probBefore: 0.5, probAfter: 0.9 },
    ]
    const contract = makeContract(
      [makeAnswer('busy', 0.5), makeAnswer('moved', 0.9)],
      lastBetTime
    )

    serve(bets, noon + 5 * HOUR_MS)
    const reused = await getBetPointsAndLatestBetTime(contract, window)
    expect(lineOf(reused.points, 'moved')).toEqual([])
    expect(reused.latestBetTime).toBe(noon + HOUR_MS)

    serve(bets)
    const fresh = await getBetPointsAndLatestBetTime(contract, window)
    expect(lineOf(fresh.points, 'moved')).toEqual([
      [window.afterTime, 0.5],
      [lastBetTime, 0.9],
    ])
    expect(fresh.latestBetTime).toBe(lastBetTime)
  })

  it('reports no latest bet when nothing comes back', async () => {
    serve([])
    const { latestBetTime } = await getBetPointsAndLatestBetTime(
      makeContract([makeAnswer('a', 0.9)], lastBetTime),
      window
    )
    expect(latestBetTime).toBeUndefined()
  })

  it('asks for a short window in one request', async () => {
    const requests = serve([])
    await getBetPointsBetween(makeContract([makeAnswer('a', 0.9)], noon), {
      afterTime: noon - HOUR_MS,
      beforeTime: noon + 1000,
    })
    expect(requests).toEqual([
      expect.objectContaining({
        afterTime: noon - HOUR_MS,
        beforeTime: noon + 1000,
        limit: 5000,
      }),
    ])
  })
})

describe('a whole-history fetch answered with a reused response', () => {
  // The chart keeps the widest whole history it has fetched and reads from it
  // where a quiet answer stood when a past window opened. This runs the real
  // fetch against the stand-in, then the coverage rule and the lookup, the way
  // the chart's fetcher strings them together.
  const created = noon - 100 * 24 * HOUR_MS
  const L = noon + 6 * HOUR_MS
  const bets: StoredBet[] = [
    { at: L - HOUR_MS, answerId: 'a', probBefore: 0.2, probAfter: 0.3 },
    { at: L, answerId: 'b', probBefore: 0.5, probAfter: 0.6 },
    // After the first response was made:
    { at: L + 200, answerId: 'a', probBefore: 0.3, probAfter: 0.9 },
    { at: L + 800, answerId: 'c', probBefore: 0.5, probAfter: 0.4 },
  ]
  const answers = [
    makeAnswer('a', 0.9),
    makeAnswer('b', 0.6),
    makeAnswer('c', 0.4),
  ]
  // The same request both times: the view's right edge has not moved, so the
  // window still ends a second after L.
  const request = { afterTime: created - 1000, beforeTime: L + 1000 }

  const fetchWholeHistory = async (
    lastBetTime: number
  ): Promise<CoveredMultiPoints> => {
    const { points, latestBetTime } = await getBetPointsAndLatestBetTime(
      makeContract(answers, lastBetTime),
      request
    )
    const lines: CoveredMultiPoints['points'] = {}
    for (const p of [...points].sort((x, y) => x.x - y.x))
      if (p.answerId) (lines[p.answerId] ??= []).push({ x: p.x, y: p.y })
    return {
      points: lines,
      coveredUntil: getWholeHistoryCoverage(
        { min: request.afterTime, latestBetTime },
        created
      ),
    }
  }

  beforeEach(() => mockApi.mockReset())

  it('vouches only up to the last bet the response holds', async () => {
    // The page now knows of the bet at L + 800 ms, but the endpoint answers
    // with the response it made just after L.
    serve(bets, L + 100)
    const reused = await fetchWholeHistory(L + 800)
    expect(reused.coveredUntil).toBe(L)
    // `a` was at 90% from L + 200 ms. The reused history shows 30% there, and
    // must not be believed.
    expect(getKnownStepValueAt([reused], 'a', L + 400)).toBeUndefined()
    // Up to its last row it is good.
    expect(getKnownStepValueAt([reused], 'a', L)).toBe(0.3)
  })

  it('answers for the later time once a fresh response arrives', async () => {
    serve(bets, L + 100)
    const reused = await fetchWholeHistory(L + 800)
    serve(bets)
    const fresh = await fetchWholeHistory(L + 800)
    expect(fresh.coveredUntil).toBe(L + 800)

    const kept = widerHistory(widerHistory(undefined, reused), fresh)
    expect(kept).toBe(fresh)
    expect(getKnownStepValueAt([fresh], 'a', L + 400)).toBe(0.9)
  })

  it('does not swap a fresh history for a reused one that comes later', async () => {
    serve(bets)
    const fresh = await fetchWholeHistory(L + 800)
    serve(bets, L + 100)
    const reused = await fetchWholeHistory(L + 800)
    expect(widerHistory(fresh, reused)).toBe(fresh)
  })
})
