import { Answer } from './answer'
import { getBetPointsBetween } from './bets'
import { MultiContract } from './contract'
import { unauthedApi } from './util/api'
import { HOUR_MS } from './util/time'

// getBetPointsBetween against a stand-in for the bet-points endpoint, to pin
// what it asks for and how it reads the answer.
jest.mock('common/util/api', () => ({ unauthedApi: jest.fn() }))
const mockApi = unauthedApi as unknown as jest.Mock

type Row = {
  createdTime: number
  answerId: string
  probBefore: number
  probAfter: number
}
type Request = { afterTime: number; beforeTime: number; limit: number }

// Answers the way the endpoint does: both ends exclusive, at most `limit` rows.
const serve = (rows: Row[]) => {
  const requests: Request[] = []
  mockApi.mockImplementation(async (_path: string, params: Request) => {
    requests.push(params)
    return rows
      .filter(
        (r) =>
          r.createdTime > params.afterTime && r.createdTime < params.beforeTime
      )
      .slice(0, params.limit)
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
  const window = {
    afterTime: noon - 2 * HOUR_MS,
    beforeTime: noon + 6 * HOUR_MS + 1000,
  }

  beforeEach(() => mockApi.mockReset())

  it('asks for a long window in two halves, each with an explicit limit', async () => {
    const requests = serve([])
    await getBetPointsBetween(
      makeContract([makeAnswer('a', 0.9)], noon + 6 * HOUR_MS),
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
    serve([
      { createdTime: noon, answerId: 'a', probBefore: 0.5, probAfter: 0.9 },
    ])
    const points = await getBetPointsBetween(
      makeContract([makeAnswer('a', 0.9)], noon + 6 * HOUR_MS),
      window
    )
    expect(lineOf(points, 'a')).toEqual([
      [window.afterTime, 0.5],
      [noon, 0.9],
    ])
  })

  it('counts a bet that falls in both halves once', async () => {
    serve([
      { createdTime: noon, answerId: 'a', probBefore: 0.5, probAfter: 0.9 },
      { createdTime: noon + 5, answerId: 'a', probBefore: 0.9, probAfter: 0.8 },
    ])
    const points = await getBetPointsBetween(
      makeContract([makeAnswer('a', 0.8)], noon + 6 * HOUR_MS),
      window
    )
    expect(lineOf(points, 'a')).toEqual([
      [window.afterTime, 0.5],
      [noon, 0.9],
      [noon + 5, 0.8],
    ])
  })

  it('places a quiet answer at its current level only when no request hit its limit', async () => {
    const crowd = (count: number): Row[] =>
      Array.from({ length: count }, (_, i) => ({
        createdTime: noon + HOUR_MS + i,
        answerId: 'busy',
        probBefore: 0.5,
        probAfter: 0.5,
      }))
    const contract = makeContract(
      [makeAnswer('busy', 0.5), makeAnswer('quiet', 0.9)],
      noon + 6 * HOUR_MS
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
