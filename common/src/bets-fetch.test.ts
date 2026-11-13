import { Answer } from './answer'
import { getBetPointsAndLatestBetTime, getBetPointsBetween } from './bets'
import { BinaryContract, MultiContract } from './contract'
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
  answerId?: string
  probBefore: number
  probAfter: number
}
type Request = { afterTime: number; beforeTime: number; limit: number }

// Answers the way the endpoint does: both ends exclusive, compared at full
// precision, at most `limit` rows, times returned in whole milliseconds.
//
// `asOf`: the moment the response to a request was made. The endpoint and the
// CDN reuse responses, so it can be earlier than now, and differ from one
// request to the next. Bets made after it are not in the response.
const serve = (
  bets: StoredBet[],
  asOf: number | ((request: Request) => number) = Infinity
) => {
  const requests: Request[] = []
  mockApi.mockImplementation(async (_path: string, params: Request) => {
    requests.push(params)
    const madeAt = typeof asOf === 'number' ? asOf : asOf(params)
    return bets
      .filter(
        (b) =>
          b.at <= madeAt && b.at > params.afterTime && b.at < params.beforeTime
      )
      .slice(0, params.limit)
      .map(({ at, ...rest }) => ({ ...rest, createdTime: Math.floor(at) }))
  })
  return requests
}

const noon = Date.parse('2026-11-05T12:00:00Z')
const created = noon - 100 * 24 * HOUR_MS

// A cpmm-multi-1 answer (p = 0.5) whose pool gives exactly `prob`.
const makeAnswer = (id: string, prob: number): Answer => ({
  id,
  index: 0,
  contractId: 'c1',
  userId: 'u1',
  text: `Answer ${id}`,
  createdTime: created,
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
    createdTime: created,
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

// 10:00 to just past 18:00, which the fetch splits on the hour at 12:00.
const lastBetTime = noon + 6 * HOUR_MS
const window = {
  afterTime: noon - 2 * HOUR_MS,
  beforeTime: lastBetTime + 1,
}

beforeEach(() => mockApi.mockReset())

describe('getBetPointsBetween, a long multiple choice window', () => {
  it('asks for the settled part, then for the rest from the last bet it holds', async () => {
    const requests = serve([
      { at: noon - HOUR_MS, answerId: 'a', probBefore: 0.5, probAfter: 0.7 },
      { at: lastBetTime, answerId: 'a', probBefore: 0.7, probAfter: 0.9 },
    ])
    await getBetPointsBetween(
      makeContract([makeAnswer('a', 0.9)], lastBetTime),
      window
    )
    expect(requests).toEqual([
      expect.objectContaining({
        afterTime: window.afterTime,
        beforeTime: noon,
        limit: 5000,
      }),
      expect.objectContaining({
        afterTime: noon - HOUR_MS - 1,
        beforeTime: window.beforeTime,
        limit: 5000,
      }),
    ])
  })

  it('asks for the whole window when the settled part holds no bet', async () => {
    const requests = serve([])
    await getBetPointsBetween(
      makeContract([makeAnswer('a', 0.9)], lastBetTime),
      window
    )
    expect(requests.map((r) => [r.afterTime, r.beforeTime])).toEqual([
      [window.afterTime, noon],
      [window.afterTime, window.beforeTime],
    ])
  })

  it('never asks for anything before the window', async () => {
    // The settled part's last bet is a fraction of a millisecond into the
    // window, so a millisecond before it would be outside.
    const requests = serve([
      {
        at: window.afterTime + 0.4,
        answerId: 'a',
        probBefore: 0.5,
        probAfter: 0.9,
      },
    ])
    await getBetPointsBetween(
      makeContract([makeAnswer('a', 0.9)], lastBetTime),
      window
    )
    expect(requests[1].afterTime).toBe(window.afterTime)
  })

  it('does not lose a bet made exactly on the split', async () => {
    // The answer's only move, 50% to 90%, at 12:00:00.000. Asked for in two
    // halves that both stopped at the split, it was in neither, and the line
    // then started flat at 90%.
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

  it('counts the bet both parts return once', async () => {
    const requests = serve([
      { at: noon - HOUR_MS, answerId: 'a', probBefore: 0.5, probAfter: 0.7 },
      { at: noon + 5, answerId: 'a', probBefore: 0.7, probAfter: 0.8 },
    ])
    const points = await getBetPointsBetween(
      makeContract([makeAnswer('a', 0.8)], noon + 5),
      window
    )
    expect(requests).toHaveLength(2)
    expect(lineOf(points, 'a')).toEqual([
      [window.afterTime, 0.5],
      [noon - HOUR_MS, 0.7],
      [noon + 5, 0.8],
    ])
  })

  it('takes every row made in the same millisecond as the last settled bet', async () => {
    // One trade in a market whose answers sum to one writes a row per answer,
    // all at the same time. A settled part that holds only one of them (it
    // can be a sample) must not leave the others out.
    const trade = noon - HOUR_MS
    const requests = serve([
      { at: trade, answerId: 'a', probBefore: 0.5, probAfter: 0.7 },
      { at: trade, answerId: 'b', probBefore: 0.5, probAfter: 0.3 },
    ])
    // The settled part, asked for first, comes back with one of the two.
    mockApi.mockImplementationOnce(async (_path: string, params: Request) => {
      requests.push(params)
      return [
        { createdTime: trade, answerId: 'a', probBefore: 0.5, probAfter: 0.7 },
      ]
    })
    const points = await getBetPointsBetween(
      makeContract([makeAnswer('a', 0.7), makeAnswer('b', 0.3)], trade),
      window
    )
    expect(lineOf(points, 'b')).toEqual([
      [window.afterTime, 0.5],
      [trade, 0.3],
    ])
  })

  it('makes up for a settled part that was answered from an old copy', async () => {
    // An hour-long market. Its last bet is a second before 12:00, and someone
    // fetches its chart right then: a request that ends at 12:00, answered
    // 900 ms before 12:00. Then `a` moves 50% to 90%, 500 ms before 12:00.
    // Six hours on, the settled part of a split fetch is that same request,
    // and the old answer is served again. It lacks `a`'s move.
    const openedAt = noon - HOUR_MS
    const bets: StoredBet[] = [
      { at: noon - 1000, answerId: 'b', probBefore: 0.5, probAfter: 0.6 },
      { at: noon - 500, answerId: 'a', probBefore: 0.5, probAfter: 0.9 },
      { at: lastBetTime, answerId: 'c', probBefore: 0.5, probAfter: 0.4 },
    ]
    const answers = ['a', 'b', 'c'].map((id, i) => ({
      ...makeAnswer(id, [0.9, 0.6, 0.4][i]),
      createdTime: openedAt,
    }))
    const contract = {
      ...makeContract(answers, lastBetTime),
      createdTime: openedAt,
    } as unknown as MultiContract
    const wholeHistory = {
      afterTime: openedAt - 1000,
      beforeTime: lastBetTime + 1,
    }
    const requests = serve(bets, (request) =>
      request.beforeTime === noon ? noon - 900 : Infinity
    )

    const { points, latestBetTime } = await getBetPointsAndLatestBetTime(
      contract,
      wholeHistory
    )

    // The recent part starts from the old copy's last bet, not from 12:00.
    expect(requests[1].afterTime).toBe(noon - 1000 - 1)
    expect(lineOf(points, 'a')).toEqual([
      [openedAt, 0.5],
      [noon - 500, 0.9],
    ])
    // So the rows have no hole, and vouching for them up to the last one is
    // sound: a window that opens just after 12:00 finds `a` at 90%.
    expect(latestBetTime).toBe(lastBetTime)
    const lines: CoveredMultiPoints['points'] = {}
    for (const p of [...points].sort((x, y) => x.x - y.x))
      if (p.answerId) (lines[p.answerId] ??= []).push({ x: p.x, y: p.y })
    const history = {
      points: lines,
      coveredUntil: getWholeHistoryCoverage(
        { min: wholeHistory.afterTime, latestBetTime },
        openedAt
      ),
    }
    expect(getKnownStepValueAt([history], 'a', noon + 100)).toBe(0.9)
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

    // A response came back as long as its limit. A bet on `quiet` may have
    // been cut off, so its current level says nothing about the window's start.
    serve(crowd(5000))
    expect(
      lineOf(await getBetPointsBetween(contract, window), 'quiet')
    ).toEqual([])
  })

  it('does not place a quiet answer from a reused response that predates the last bet', async () => {
    // `moved` went from 50% to 90% at 18:00. The responses were made at 17:00
    // and are served again. None hit its limit, and they prove nothing.
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
})

describe('getBetPointsBetween, other windows', () => {
  it('asks for a short window in one request', async () => {
    const requests = serve([])
    await getBetPointsBetween(makeContract([makeAnswer('a', 0.9)], noon), {
      afterTime: noon - HOUR_MS,
      beforeTime: noon + 1,
    })
    expect(requests).toEqual([
      expect.objectContaining({
        afterTime: noon - HOUR_MS,
        beforeTime: noon + 1,
        limit: 5000,
      }),
    ])
  })

  it('asks for a long binary window in two halves at once, joined on the hour', async () => {
    const binary = {
      id: 'b1',
      mechanism: 'cpmm-1',
      outcomeType: 'BINARY',
      createdTime: created,
      initialProbability: 0.5,
      lastBetTime,
    } as unknown as BinaryContract
    const requests = serve([
      { at: noon - HOUR_MS, probBefore: 0.5, probAfter: 0.7 },
      { at: noon, probBefore: 0.7, probAfter: 0.8 },
    ])
    const points = await getBetPointsBetween(binary, window)
    expect(
      requests
        .map((r) => [r.afterTime, r.beforeTime])
        .sort((a, b) => a[0] - b[0])
    ).toEqual([
      [window.afterTime, noon],
      [noon - 1, window.beforeTime],
    ])
    // The bet on the split is in the recent half.
    expect(points.map((p) => [p.x, p.y])).toEqual([
      [window.afterTime, 0.5],
      [noon - HOUR_MS, 0.7],
      [noon, 0.8],
    ])
  })
})

describe('a whole-history fetch answered with a reused response', () => {
  // The chart keeps the widest whole history it has fetched and reads from it
  // where a quiet answer stood when a past window opened. This runs the real
  // fetch against the stand-in, then the coverage rule and the lookup, the way
  // the chart's fetcher strings them together.
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
  // A request that reaches a second past L, as the chart used to send and as
  // pages still open on the older code do. The same request both times.
  const request = { afterTime: created - 1000, beforeTime: L + 1000 }

  const fetchWholeHistory = async (
    knownLastBetTime: number
  ): Promise<CoveredMultiPoints> => {
    const { points, latestBetTime } = await getBetPointsAndLatestBetTime(
      makeContract(answers, knownLastBetTime),
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
