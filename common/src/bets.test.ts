import { Answer } from './answer'
import { getPointsFromBetRows } from './bets'
import { BinaryContract, MultiContract } from './contract'
import { DAY_MS, HOUR_MS, MINUTE_MS } from './util/time'

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
    complete: true,
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

  it('does not read a sample that lacks an answer as proof it did not move', () => {
    // The endpoint returns a random sample of a crowded window. An answer's
    // one bet can be missing from it, so its current level says nothing about
    // where it stood when the window opened.
    const moved = makeAnswer('moved', 0.9)
    const contract = makeContract([moved], { shouldAnswersSumToOne: false })
    const sampled = { ...quietHour, complete: false }

    expect(getPointsFromBetRows(contract, [], sampled)).toEqual([])
    // Earlier history, where the caller has it, still places the line.
    expect(
      lineOf(
        getPointsFromBetRows(contract, [], sampled, () => 0.5),
        'moved'
      )
    ).toEqual([[quietHour.afterTime, 0.5]])
  })

  it('starts an answer with bets at the probability before its first one', () => {
    const a = makeAnswer('a', 0.6)
    const b = makeAnswer('b', 0.4)
    const contract = makeContract([a, b], { lastBetTime: now - 10 })
    const window = { afterTime: now - HOUR_MS, beforeTime: now, complete: true }
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
      complete: true,
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

  describe('the whole history, as the server render asks for it', () => {
    const window = (complete: boolean) => ({
      afterTime: marketCreated,
      beforeTime: now - DAY_MS + 1,
      complete,
    })
    const rows = [bet('traded', now - DAY_MS, 0.5, 0.7)]

    it('starts every opening answer at its opening probability', () => {
      const traded = makeAnswer('traded', 0.7)
      // Its one bet, from 50% to 90%, is not in the sample.
      const unsampled = makeAnswer('unsampled', 0.9)
      const contract = makeContract([traded, unsampled], {
        shouldAnswersSumToOne: false,
        lastBetTime: now - DAY_MS,
      })

      for (const complete of [true, false]) {
        const points = getPointsFromBetRows(contract, rows, window(complete))
        expect(lineOf(points, 'traded')).toEqual([
          [marketCreated, 0.5],
          [now - DAY_MS, 0.7],
        ])
        // Never the 90% it reached later: the opening probability is on
        // record, and the chart adds the current level as the last point.
        expect(lineOf(points, 'unsampled')).toEqual([[marketCreated, 0.5]])
      }
    })

    it('starts an added answer nobody has bet on where it is, if every bet is there', () => {
      const other = makeAnswer('other', 0.3, { isOther: true })
      const added = makeAnswer('added', 0.2, {
        createdTime: marketCreated + 100 * DAY_MS,
      })
      const contract = makeContract([other, added], {
        lastBetTime: now - DAY_MS,
      })
      // The market's last bet, which was not on the added answer.
      const lastBet = [bet('other', now - DAY_MS, 0.35, 0.3)]

      expect(
        lineOf(getPointsFromBetRows(contract, lastBet, window(true)), 'added')
      ).toEqual([[added.createdTime, 0.2]])
      // With only a sample there is no telling, and no line start.
      expect(
        lineOf(getPointsFromBetRows(contract, lastBet, window(false)), 'added')
      ).toEqual([])
      // Nor with rows that stop short of the market's last bet.
      expect(
        lineOf(getPointsFromBetRows(contract, [], window(true)), 'added')
      ).toEqual([])
    })
  })
})

describe("getPointsFromBetRows, rows older than the market's last bet", () => {
  // The endpoint and the CDN in front of it reuse responses. Here the page
  // knows of a bet ten minutes ago, and the rows were served from before it.
  const lastBetTime = now - 10 * MINUTE_MS
  const window = {
    afterTime: now - HOUR_MS,
    beforeTime: lastBetTime + 1000,
    complete: true,
  }
  const reused = [bet('busy', now - 30 * MINUTE_MS, 0.45, 0.5)]
  const busy = makeAnswer('busy', 0.5)

  it('do not place a quiet answer at its current level', () => {
    // `moved` went from 50% to 90% in that last bet. Rows that lack it must
    // not be read as "it has been at 90% all hour".
    const moved = makeAnswer('moved', 0.9)
    const contract = makeContract([moved, busy], {
      shouldAnswersSumToOne: false,
      lastBetTime,
    })
    const points = getPointsFromBetRows(contract, reused, window)
    expect(lineOf(points, 'moved')).toEqual([])
    expect(lineOf(points, 'busy')).toEqual([
      [window.afterTime, 0.45],
      [now - 30 * MINUTE_MS, 0.5],
    ])
    // Earlier history, where the caller has it, still places the line.
    expect(
      lineOf(
        getPointsFromBetRows(contract, reused, window, () => 0.5),
        'moved'
      )
    ).toEqual([[window.afterTime, 0.5]])
  })

  it('place it once the last bet is among them', () => {
    const quiet = makeAnswer('quiet', 0.3)
    const contract = makeContract([quiet, busy], {
      shouldAnswersSumToOne: false,
      lastBetTime,
    })
    const fresh = [...reused, bet('busy', lastBetTime, 0.5, 0.55)]
    expect(
      lineOf(getPointsFromBetRows(contract, fresh, window), 'quiet')
    ).toEqual([[window.afterTime, 0.3]])
    // Without it, nothing.
    expect(
      lineOf(getPointsFromBetRows(contract, reused, window), 'quiet')
    ).toEqual([])
  })

  it('place it when the market has not traded since the window opened', () => {
    // Last bet two hours ago, window of one hour: there is no bet to miss.
    const quiet = makeAnswer('quiet', 0.3)
    const contract = makeContract([quiet], { shouldAnswersSumToOne: false })
    expect(
      lineOf(
        getPointsFromBetRows(contract, [], {
          afterTime: now - HOUR_MS,
          beforeTime: now,
          complete: true,
        }),
        'quiet'
      )
    ).toEqual([[now - HOUR_MS, 0.3]])
  })

  it('place it in a market that has never traded', () => {
    const quiet = makeAnswer('quiet', 0.3, {
      createdTime: marketCreated + DAY_MS,
    })
    const other = makeAnswer('other', 0.7, { isOther: true })
    const contract = makeContract([quiet, other], { lastBetTime: undefined })
    expect(
      lineOf(
        getPointsFromBetRows(contract, [], {
          afterTime: marketCreated - 1000,
          beforeTime: now,
          complete: true,
        }),
        'quiet'
      )
    ).toEqual([[quiet.createdTime, 0.3]])
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
    const window = { afterTime: now - DAY_MS, beforeTime: now, complete: true }
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
        complete: true,
      })
    ).toEqual([{ x: marketCreated, y: 0.35, answerId: undefined }])
    expect(
      getPointsFromBetRows(contract, [], {
        afterTime: now - DAY_MS,
        beforeTime: now,
        complete: true,
      })
    ).toEqual([])
  })
})
