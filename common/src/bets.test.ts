import { Answer } from './answer'
import { getPointsFromBetRows } from './bets'
import { BinaryContract, MultiContract } from './contract'
import { DAY_MS, HOUR_MS } from './util/time'

const now = Date.parse('2026-11-05T17:30:00Z')
const marketCreated = now - 400 * DAY_MS

// A cpmm-multi-1 answer (p = 0.5) whose pool gives exactly `prob`.
const makeAnswer = (
  id: string,
  prob: number,
  overrides: Partial<Answer> = {}
): Answer => ({
  id,
  index: 0,
  contractId: 'c1',
  userId: 'u1',
  text: `Answer ${id}`,
  createdTime: marketCreated,
  poolYes: 100 * (1 - prob),
  poolNo: 100 * prob,
  p: 0.5,
  prob,
  totalLiquidity: 100,
  subsidyPool: 0,
  volume: 0,
  probChanges: { day: 0, week: 0, month: 0 },
  ...overrides,
})

const makeContract = (
  answers: Answer[],
  overrides: Record<string, unknown> = {}
) =>
  ({
    id: 'c1',
    mechanism: 'cpmm-multi-1',
    outcomeType: 'MULTIPLE_CHOICE',
    shouldAnswersSumToOne: true,
    addAnswersMode: 'ANYONE',
    createdTime: marketCreated,
    lastBetTime: now - 2 * HOUR_MS,
    answers,
    ...overrides,
  } as unknown as MultiContract)

const bet = (
  answerId: string,
  createdTime: number,
  probBefore: number,
  probAfter: number
) => ({ answerId, createdTime, probBefore, probAfter })

const lineOf = (
  points: { x: number; y: number; answerId: string | undefined }[],
  answerId: string
) =>
  points
    .filter((p) => p.answerId === answerId)
    .sort((a, b) => a.x - b.x)
    .map((p) => [p.x, p.y])

describe('getPointsFromBetRows, multiple choice', () => {
  // The last hour of a market whose last bet was two hours ago. The chart asks
  // for bets up to just past the last one, so the window it sends is empty.
  const quietHour = {
    afterTime: now - HOUR_MS,
    beforeTime: now - 2 * HOUR_MS + 1000,
  }

  it('starts an answer with no bet in the window where it is now', () => {
    // Seen on prod 2026-11-05: the 1H view of the 2028 Democratic nominee
    // market drew Jon Ossoff, an answer added after the market opened, flat at
    // 0% for the hour and then jumping to 23%. He had been at 23% throughout.
    const ossoff = makeAnswer('ossoff', 0.23, {
      createdTime: marketCreated + 200 * DAY_MS,
    })
    const other = makeAnswer('other', 0.14, { isOther: true })
    const contract = makeContract([ossoff, other])

    const points = getPointsFromBetRows(contract, [], quietHour)

    expect(lineOf(points, 'ossoff')).toEqual([[quietHour.afterTime, 0.23]])
    expect(lineOf(points, 'other')).toEqual([[quietHour.afterTime, 0.14]])
  })

  it('uses the pool, not the resolution, for a resolved answer with no bet', () => {
    const won = makeAnswer('won', 0.8, { resolution: 'YES' })
    const contract = makeContract([won], { shouldAnswersSumToOne: false })
    expect(
      lineOf(getPointsFromBetRows(contract, [], quietHour), 'won')
    ).toEqual([[quietHour.afterTime, 0.8]])
  })

  it('starts an answer with bets at the probability before its first one', () => {
    const a = makeAnswer('a', 0.6)
    const b = makeAnswer('b', 0.4)
    const contract = makeContract([a, b], { lastBetTime: now - 10 })
    const window = { afterTime: now - HOUR_MS, beforeTime: now }
    const rows = [
      bet('a', now - 20, 0.55, 0.6),
      bet('a', now - 1000, 0.5, 0.55),
      bet('b', now - 1000, 0.5, 0.45),
      bet('b', now - 20, 0.45, 0.4),
    ]

    const points = getPointsFromBetRows(contract, rows, window)

    expect(lineOf(points, 'a')).toEqual([
      [window.afterTime, 0.5],
      [now - 1000, 0.55],
      [now - 20, 0.6],
    ])
    expect(lineOf(points, 'b')).toEqual([
      [window.afterTime, 0.5],
      [now - 1000, 0.45],
      [now - 20, 0.4],
    ])
  })

  it('starts a line no earlier than its answer', () => {
    const late = makeAnswer('late', 0.1, { createdTime: now - 30 * 60 * 1000 })
    const contract = makeContract([late])
    expect(
      lineOf(getPointsFromBetRows(contract, [], quietHour), 'late')
    ).toEqual([[late.createdTime, 0.1]])
  })

  describe("a window that ends before the market's last bet", () => {
    // Last week of October, looked at a week later: bets since may have moved
    // any answer, so where it is now says nothing about then.
    const window = {
      afterTime: now - 14 * DAY_MS,
      beforeTime: now - 7 * DAY_MS,
    }
    const quiet = makeAnswer('quiet', 0.62)
    const contract = makeContract([quiet], { shouldAnswersSumToOne: false })

    it('asks the caller where an answer with no bet stood', () => {
      const asked: string[] = []
      const points = getPointsFromBetRows(contract, [], window, (id) => {
        asked.push(id)
        return 0.31
      })
      expect(asked).toEqual(['quiet'])
      expect(lineOf(points, 'quiet')).toEqual([[window.afterTime, 0.31]])
    })

    it('draws nothing for an answer nobody can place', () => {
      expect(getPointsFromBetRows(contract, [], window)).toEqual([])
      expect(
        getPointsFromBetRows(contract, [], window, () => undefined)
      ).toEqual([])
      expect(getPointsFromBetRows(contract, [], window, () => NaN)).toEqual([])
    })

    it('does not ask about an answer that has bets in the window', () => {
      const rows = [bet('quiet', window.afterTime + 5, 0.4, 0.45)]
      const points = getPointsFromBetRows(contract, rows, window, () => {
        throw new Error('not needed')
      })
      expect(lineOf(points, 'quiet')).toEqual([
        [window.afterTime, 0.4],
        [window.afterTime + 5, 0.45],
      ])
    })

    it('starts an answer made inside the window at its opening probability', () => {
      // No added answers, so each of the two opened at 50%.
      const a = makeAnswer('a', 0.9, { createdTime: window.afterTime + 100 })
      const b = makeAnswer('b', 0.1, { createdTime: window.afterTime + 100 })
      const fixed = makeContract([a, b], {
        addAnswersMode: 'DISABLED',
        createdTime: window.afterTime + 100,
      })
      const points = getPointsFromBetRows(fixed, [], window)
      expect(lineOf(points, 'a')).toEqual([[a.createdTime, 0.5]])
      expect(lineOf(points, 'b')).toEqual([[b.createdTime, 0.5]])
    })

    it('draws nothing for an added answer whose opening probability is not on record', () => {
      const other = makeAnswer('other', 0.3, { isOther: true })
      const added = makeAnswer('added', 0.2, {
        createdTime: window.afterTime + 100,
      })
      const points = getPointsFromBetRows(
        makeContract([other, added]),
        [],
        window,
        () => undefined
      )
      expect(lineOf(points, 'added')).toEqual([])
    })
  })

  it('covers the whole history the way the server render asks for it', () => {
    const traded = makeAnswer('traded', 0.7)
    const untouched = makeAnswer('untouched', 0.3)
    const contract = makeContract([traded, untouched], {
      shouldAnswersSumToOne: false,
      lastBetTime: now - DAY_MS,
    })
    const window = { afterTime: marketCreated, beforeTime: now - DAY_MS + 1 }
    const rows = [bet('traded', now - DAY_MS, 0.5, 0.7)]

    const points = getPointsFromBetRows(contract, rows, window)

    expect(lineOf(points, 'traded')).toEqual([
      [marketCreated, 0.5],
      [now - DAY_MS, 0.7],
    ])
    expect(lineOf(points, 'untouched')).toEqual([[marketCreated, 0.3]])
  })
})

describe('getPointsFromBetRows, binary', () => {
  const contract = {
    id: 'b1',
    mechanism: 'cpmm-1',
    outcomeType: 'BINARY',
    createdTime: marketCreated,
    initialProbability: 0.35,
    lastBetTime: now - HOUR_MS,
  } as unknown as BinaryContract

  it('starts at the probability before the first bet in the window', () => {
    const window = { afterTime: now - DAY_MS, beforeTime: now }
    const rows = [
      { createdTime: now - 10, probBefore: 0.5, probAfter: 0.6 },
      { createdTime: now - HOUR_MS, probBefore: 0.4, probAfter: 0.5 },
    ]
    expect(
      getPointsFromBetRows(contract, rows, window).map((p) => [p.x, p.y])
    ).toEqual([
      [window.afterTime, 0.4],
      [now - HOUR_MS, 0.5],
      [now - 10, 0.6],
    ])
  })

  it('with no bets, has a point only when the window opens with the market', () => {
    expect(
      getPointsFromBetRows(contract, [], {
        afterTime: marketCreated,
        beforeTime: now,
      })
    ).toEqual([{ x: marketCreated, y: 0.35, answerId: undefined }])
    expect(
      getPointsFromBetRows(contract, [], {
        afterTime: now - DAY_MS,
        beforeTime: now,
      })
    ).toEqual([])
  })
})
