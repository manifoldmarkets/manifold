import { Answer } from './answer'
import { getAnswerProbability } from './calculate'
import { MultiContract } from './contract'
import {
  addLivePoints,
  chooseChartPoints,
  continueLine,
  FetchedMultiPoints,
  getDefaultGraphedAnswerIds,
  getFittedProbDomain,
  getKnownStepValueAt,
  getStepValueAt,
  getUncoveredAnswerIds,
  getWholeHistoryCoverage,
  getWholeHistoryLines,
  getWholeHistoryPoints,
  getZoomWindow,
  hasUndeliveredBet,
  isBehindLastBet,
  isOnItsWay,
  latestDefined,
  MAX_DEFAULT_GRAPHED_ANSWERS,
  movedProbability,
  thinPoints,
  WholeHistoryLines,
  widerHistory,
  withFurtherLines,
  withLivePoints,
} from './multi-chart'

// A cpmm-multi-1 answer (p = 0.5) whose pool gives exactly `prob`.
const makeAnswer = (
  id: string,
  prob: number,
  index: number,
  overrides: Partial<Answer> = {}
): Answer => ({
  id,
  index,
  contractId: 'c1',
  userId: 'u1',
  text: `Answer ${id}`,
  createdTime: 0,
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

const makeContract = (answers: Answer[]) =>
  ({
    mechanism: 'cpmm-multi-1',
    outcomeType: 'MULTIPLE_CHOICE',
    shouldAnswersSumToOne: true,
    answers,
  } as unknown as MultiContract)

describe('getDefaultGraphedAnswerIds', () => {
  it('picks the likeliest answers, not the first ones in the list', () => {
    // The Senate seats market, 2026-11-05: the list is in creation order, so
    // its first six answers were all at 0.2% while the leaders sat at the end.
    const answers = [
      makeAnswer('44', 0.002, 0),
      makeAnswer('45', 0.003, 1),
      makeAnswer('46', 0.003, 2),
      makeAnswer('47', 0.002, 3),
      makeAnswer('48', 0.002, 4),
      makeAnswer('49', 0.002, 5),
      makeAnswer('50', 0.002, 6),
      makeAnswer('54', 0.03, 7),
      makeAnswer('55', 0.13, 8),
      makeAnswer('56', 0.8, 9),
      makeAnswer('other', 0.017, 10),
    ]
    const ids = getDefaultGraphedAnswerIds(makeContract(answers), answers)
    expect(ids).toHaveLength(MAX_DEFAULT_GRAPHED_ANSWERS)
    expect(ids.slice(0, 4)).toEqual(['56', '55', '54', 'other'])
    // Equal probabilities keep creation order.
    expect(ids.slice(4)).toEqual(['45', '46'])
  })

  it('counts a resolved answer at its resolution, not its pool', () => {
    const answers = [
      makeAnswer('a', 0.9, 0, { resolution: 'NO' }),
      makeAnswer('b', 0.4, 1),
      makeAnswer('c', 0.2, 2, { resolution: 'YES' }),
    ]
    expect(getDefaultGraphedAnswerIds(makeContract(answers), answers)).toEqual([
      'c',
      'b',
      'a',
    ])
  })

  it('chooses only among the candidates it is given', () => {
    const answers = [
      makeAnswer('a', 0.5, 0),
      makeAnswer('b', 0.3, 1),
      makeAnswer('c', 0.2, 2),
    ]
    const contract = makeContract(answers)
    expect(
      getDefaultGraphedAnswerIds(contract, [answers[2], answers[1]])
    ).toEqual(['b', 'c'])
    expect(getDefaultGraphedAnswerIds(contract, [])).toEqual([])
  })

  it('puts an answer with a broken pool last', () => {
    const answers = [
      makeAnswer('broken', 0.5, 0, { poolYes: NaN }),
      makeAnswer('b', 0.01, 1),
    ]
    expect(getDefaultGraphedAnswerIds(makeContract(answers), answers)).toEqual([
      'b',
      'broken',
    ])
  })
})

describe('getDefaultGraphedAnswerIds, resolved markets', () => {
  it('puts the answers a resolved market paid out to first', () => {
    // A market that resolves to its answers records the payouts on the
    // contract, not on each answer. The winner here was at 1% in its pool.
    const answers = [
      makeAnswer('a', 0.4, 0),
      makeAnswer('b', 0.2, 1),
      makeAnswer('c', 0.15, 2),
      makeAnswer('d', 0.1, 3),
      makeAnswer('e', 0.08, 4),
      makeAnswer('f', 0.06, 5),
      makeAnswer('winner', 0.01, 6),
    ]
    const contract = {
      ...makeContract(answers),
      resolutions: { winner: 100 },
    } as unknown as MultiContract
    const ids = getDefaultGraphedAnswerIds(contract, answers)
    expect(ids[0]).toBe('winner')
    expect(ids).toEqual(['winner', 'a', 'b', 'c', 'd', 'e'])
  })

  it('orders a split payout by share', () => {
    const answers = [
      makeAnswer('a', 0.5, 0),
      makeAnswer('b', 0.3, 1),
      makeAnswer('c', 0.2, 2),
    ]
    const contract = {
      ...makeContract(answers),
      resolutions: { c: 70, b: 30 },
    } as unknown as MultiContract
    expect(getDefaultGraphedAnswerIds(contract, answers)).toEqual([
      'c',
      'b',
      'a',
    ])
  })
})

describe('getDefaultGraphedAnswerIds, payouts before probabilities', () => {
  // Six answers that paid nothing, each at 15% in its pool, and two that
  // shared the payout 99 to 1 from pools at 9.9% and 0.1%.
  const unpaid = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'].map((id, i) =>
    makeAnswer(id, 0.15, i)
  )
  const big = makeAnswer('big', 0.099, 6)
  const small = makeAnswer('small', 0.001, 7)
  const answers = [...unpaid, big, small]
  const contract = {
    ...makeContract(answers),
    resolutions: { big: 99, small: 1 },
  } as unknown as MultiContract

  it('ranks any payout above every answer that paid nothing', () => {
    expect(getDefaultGraphedAnswerIds(contract, answers)).toEqual([
      'big',
      'small',
      'u1',
      'u2',
      'u3',
      'u4',
    ])
  })

  it('lets a paid answer take the place of an unpaid one already drawn', () => {
    const drawn = unpaid.map((a) => a.id)
    expect(getDefaultGraphedAnswerIds(contract, answers, drawn)).toEqual([
      'big',
      'small',
      'u1',
      'u2',
      'u3',
      'u4',
    ])
  })
})

describe('getDefaultGraphedAnswerIds, keeping the current lines', () => {
  it('lets a clear leader in, however closely the drawn answers are bunched', () => {
    // Six drawn answers level at 10%, and a seventh that has risen to 40%.
    const level = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) =>
      makeAnswer(id, 0.1, i)
    )
    const leader = makeAnswer('leader', 0.4, 6)
    const list = [...level, leader]
    expect(
      getDefaultGraphedAnswerIds(
        makeContract(list),
        list,
        level.map((a) => a.id)
      )
    ).toEqual(['leader', 'a', 'b', 'c', 'd', 'e'])
  })

  it('fills free places with the best of the rest, displacing nothing', () => {
    const drawn = ['a', 'b', 'c'].map((id, i) => makeAnswer(id, 0.02, i))
    const risen = ['x', 'y'].map((id, i) => makeAnswer(id, 0.3, i + 3))
    const rest = ['p', 'q', 'r', 's'].map((id, i) =>
      makeAnswer(id, 0.021, i + 5)
    )
    const list = [...drawn, ...risen, ...rest]
    // Three drawn, six places: x, y and p take the free ones. Nothing left
    // outside leads a drawn answer by more than a point.
    expect(
      getDefaultGraphedAnswerIds(
        makeContract(list),
        list,
        drawn.map((a) => a.id)
      )
    ).toEqual(['x', 'y', 'p', 'a', 'b', 'c'])
  })

  it('replaces every drawn answer that is clearly outranked, and no other', () => {
    const drawn = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) =>
      makeAnswer(id, 0.02, i)
    )
    const risen = ['x', 'y'].map((id, i) => makeAnswer(id, 0.3, i + 6))
    const close = makeAnswer('z', 0.025, 8)
    const list = [...drawn, ...risen, close]
    // x and y take the places of the two last drawn answers. z leads the rest
    // by half a point, which is not enough to take a place.
    expect(
      getDefaultGraphedAnswerIds(
        makeContract(list),
        list,
        drawn.map((a) => a.id)
      )
    ).toEqual(['x', 'y', 'a', 'b', 'c', 'd'])
  })

  const answers = (seventh: number) => [
    makeAnswer('a', 0.4, 0),
    makeAnswer('b', 0.2, 1),
    makeAnswer('c', 0.15, 2),
    makeAnswer('d', 0.1, 3),
    makeAnswer('e', 0.08, 4),
    makeAnswer('f', 0.03, 5),
    makeAnswer('g', seventh, 6),
  ]
  const current = ['a', 'b', 'c', 'd', 'e', 'f']

  it('with nothing drawn yet, takes the likeliest', () => {
    const list = answers(0.035)
    expect(getDefaultGraphedAnswerIds(makeContract(list), list)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'g',
    ])
  })

  it('keeps a drawn answer that another has only just passed', () => {
    const list = answers(0.035)
    expect(
      getDefaultGraphedAnswerIds(makeContract(list), list, current)
    ).toEqual(current)
  })

  it('swaps a drawn answer out once another clearly leads it', () => {
    const list = answers(0.06)
    expect(
      getDefaultGraphedAnswerIds(makeContract(list), list, current)
    ).toEqual(['a', 'b', 'c', 'd', 'e', 'g'])
  })

  it('drops a drawn answer that is no longer a candidate', () => {
    const list = answers(0.035)
    const withoutF = list.filter((a) => a.id !== 'f')
    expect(
      getDefaultGraphedAnswerIds(makeContract(list), withoutF, current)
    ).toEqual(['a', 'b', 'c', 'd', 'e', 'g'])
  })

  it('never returns more than six, and is stable when fed its own answer', () => {
    const list = answers(0.035)
    const contract = makeContract(list)
    const first = getDefaultGraphedAnswerIds(contract, list, [
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
    ])
    expect(first).toHaveLength(MAX_DEFAULT_GRAPHED_ANSWERS)
    expect(getDefaultGraphedAnswerIds(contract, list, first)).toEqual(first)
  })
})

describe('getDefaultGraphedAnswerIds, on random markets', () => {
  let seed = 11
  const random = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const pickSome = <T>(list: T[], chance: number) =>
    list.filter(() => random() < chance)

  it('keeps its promises whatever the answers, payouts and current lines', () => {
    for (let trial = 0; trial < 3000; trial++) {
      const count = Math.floor(random() * 13)
      // Steps of 0.4 points, so that many answers tie and none sits exactly
      // one point (the margin) from another.
      const answers = Array.from({ length: count }, (_, i) =>
        makeAnswer(`a${i}`, Math.floor(random() * 40) * 0.004, i)
      )
      const paid = random() < 0.4 ? pickSome(answers, 0.3) : []
      const resolutions = Object.fromEntries(
        paid.map((a) => [a.id, 1 + Math.floor(random() * 3) * 20])
      )
      const contract = {
        ...makeContract(answers),
        ...(paid.length > 0 ? { resolutions } : {}),
      } as unknown as MultiContract
      const candidates = random() < 0.2 ? pickSome(answers, 0.7) : answers
      // What is drawn now: up to six answers, some of them possibly gone.
      const current = [
        ...pickSome(answers, 0.5)
          .slice(0, 5)
          .map((a) => a.id),
        ...(random() < 0.1 ? ['gone'] : []),
      ]

      const payout = (id: string) => resolutions[id] ?? 0
      const prob = (id: string) => getAnswerProbability(contract, id)
      const clearlyOutranks = (a: string, b: string) =>
        payout(a) > payout(b) ||
        (payout(a) === payout(b) && prob(a) > prob(b) + 0.01)

      const ids = getDefaultGraphedAnswerIds(contract, candidates, current)
      const candidateIds = candidates.map((a) => a.id)
      const left = candidateIds.filter((id) => !ids.includes(id))

      // As many as there are places for, each a candidate, none twice.
      expect(ids).toHaveLength(
        Math.min(candidates.length, MAX_DEFAULT_GRAPHED_ANSWERS)
      )
      expect(new Set(ids).size).toBe(ids.length)
      expect(ids.every((id) => candidateIds.includes(id))).toBe(true)

      // Nothing left out clearly outranks anything drawn.
      for (const out of left)
        for (const drawn of ids) expect(clearlyOutranks(out, drawn)).toBe(false)

      // And of all the choices that leave nothing clearly better out, it
      // keeps as many of the lines already drawn as any. Checked against
      // every possible choice.
      const beatenBy = candidateIds.map((id) =>
        candidateIds.reduce(
          (mask, other, i) =>
            clearlyOutranks(other, id) ? mask | (1 << i) : mask,
          0
        )
      )
      const drawnNow = candidateIds.reduce(
        (mask, id, i) => (current.includes(id) ? mask | (1 << i) : mask),
        0
      )
      const size = (mask: number) => {
        let count = 0
        for (let m = mask; m; m &= m - 1) count++
        return count
      }
      let mostKept = -1
      for (let choice = 0; choice < 1 << candidateIds.length; choice++) {
        if (size(choice) !== ids.length) continue
        const leavesNothingBetterOut = beatenBy.every(
          (beaters, i) => !(choice & (1 << i)) || (beaters & ~choice) === 0
        )
        if (leavesNothingBetterOut)
          mostKept = Math.max(mostKept, size(choice & drawnNow))
      }
      expect(ids.filter((id) => current.includes(id))).toHaveLength(mostKept)

      // Asked again with its own answer, it does not move.
      expect(getDefaultGraphedAnswerIds(contract, candidates, ids)).toEqual(ids)

      // With nothing drawn, it is the top of the ranking: payout, then
      // probability, then the order the answers were created in.
      const ranking = [...candidates]
        .sort(
          (a, b) =>
            payout(b.id) - payout(a.id) ||
            prob(b.id) - prob(a.id) ||
            a.index - b.index
        )
        .map((a) => a.id)
      expect(getDefaultGraphedAnswerIds(contract, candidates)).toEqual(
        ranking.slice(0, MAX_DEFAULT_GRAPHED_ANSWERS)
      )
    }
  })
})

describe('getStepValueAt', () => {
  const points = [
    { x: 10, y: 0.1 },
    { x: 20, y: 0.2 },
    { x: 20, y: 0.25 },
    { x: 30, y: 0.3 },
  ]

  it('is the last point at or before the time', () => {
    expect(getStepValueAt(points, 10)).toBe(0.1)
    expect(getStepValueAt(points, 19)).toBe(0.1)
    // Two points at one time: the later one stands.
    expect(getStepValueAt(points, 20)).toBe(0.25)
    expect(getStepValueAt(points, 29)).toBe(0.25)
    expect(getStepValueAt(points, 30)).toBe(0.3)
    expect(getStepValueAt(points, 1e9)).toBe(0.3)
  })

  it('is undefined before the line starts or with no line', () => {
    expect(getStepValueAt(points, 9)).toBeUndefined()
    expect(getStepValueAt([], 10)).toBeUndefined()
    expect(getStepValueAt(undefined, 10)).toBeUndefined()
  })

  it('agrees with a linear scan on random lines', () => {
    let seed = 11
    const random = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let trial = 0; trial < 200; trial++) {
      const n = Math.floor(random() * 30)
      let x = 0
      const line = Array.from({ length: n }, () => {
        x += Math.floor(random() * 3)
        return { x, y: random() }
      })
      const t = Math.floor(random() * (x + 4)) - 2
      const scanned = line.filter((p) => p.x <= t).pop()?.y
      expect(getStepValueAt(line, t)).toBe(scanned)
    }
  })
})

describe('getKnownStepValueAt', () => {
  const server = { a: [{ x: 10, y: 0.4 }], b: [{ x: 10, y: 0.6 }] }
  const fetched = { a: [{ x: 10, y: 0.45 }], b: [] }

  it('reads the first history that covers the time', () => {
    const histories = [
      { points: fetched, coveredUntil: 100 },
      { points: server, coveredUntil: 50 },
    ]
    expect(getKnownStepValueAt(histories, 'a', 40)).toBe(0.45)
    expect(getKnownStepValueAt(histories, 'a', 80)).toBe(0.45)
  })

  it('falls through to the next history when one has no line for the answer', () => {
    // A fetch can come back with no row for an answer the server render has.
    const histories = [
      { points: fetched, coveredUntil: 100 },
      { points: server, coveredUntil: 50 },
    ]
    expect(getKnownStepValueAt(histories, 'b', 40)).toBe(0.6)
    // But not past what that history covers.
    expect(getKnownStepValueAt(histories, 'b', 80)).toBeUndefined()
  })

  it('never answers for a time no history covers', () => {
    const histories = [
      { points: fetched, coveredUntil: 100 },
      { points: server, coveredUntil: undefined },
    ]
    expect(getKnownStepValueAt(histories, 'a', 101)).toBeUndefined()
    expect(getKnownStepValueAt(histories, 'b', 40)).toBeUndefined()
    expect(getKnownStepValueAt([], 'a', 40)).toBeUndefined()
  })

  it('counts the last covered instant as covered', () => {
    expect(
      getKnownStepValueAt([{ points: server, coveredUntil: 50 }], 'a', 50)
    ).toBe(0.4)
    expect(
      getKnownStepValueAt([{ points: server, coveredUntil: 50 }], 'a', 51)
    ).toBeUndefined()
  })
})

describe('getWholeHistoryCoverage', () => {
  const created = 1_000_000
  const lastRow = 5_000_000

  it('is the latest bet that came back, for a fetch from before the market opened', () => {
    expect(
      getWholeHistoryCoverage(
        { min: created - 1000, latestBetTime: lastRow },
        created
      )
    ).toBe(lastRow)
  })

  it('is undefined for a fetch that starts once the market is open', () => {
    // `min` is exclusive, so a fetch from the moment of creation could miss a
    // bet made in that same millisecond.
    expect(
      getWholeHistoryCoverage({ min: created, latestBetTime: lastRow }, created)
    ).toBeUndefined()
    expect(
      getWholeHistoryCoverage(
        { min: created + 5000, latestBetTime: lastRow },
        created
      )
    ).toBeUndefined()
  })

  it('is undefined when no bet came back', () => {
    expect(
      getWholeHistoryCoverage(
        { min: created - 1000, latestBetTime: undefined },
        created
      )
    ).toBeUndefined()
  })

  it('does not vouch for the time after the last bet that came back', () => {
    // The page knows of a bet 800 ms after `lastRow` and asks for a second
    // past it. The response is a reused one, made before another answer moved
    // 200 ms after `lastRow`, so its last row is `lastRow`. A window opening
    // 400 ms after it must not read the level this history shows there.
    const reused = { a: [{ x: lastRow, y: 0.3 }] }
    const coveredUntil = getWholeHistoryCoverage(
      { min: created - 1000, latestBetTime: lastRow },
      created
    )
    const histories = [{ points: reused, coveredUntil }]
    expect(getKnownStepValueAt(histories, 'a', lastRow)).toBe(0.3)
    expect(getKnownStepValueAt(histories, 'a', lastRow + 400)).toBeUndefined()
  })
})

describe('widerHistory', () => {
  const upTo = (coveredUntil: number | undefined) => ({
    points: { a: [{ x: 1, y: 0.5 }] },
    coveredUntil,
  })

  it('takes the first history that vouches for anything', () => {
    const fetched = upTo(100)
    expect(widerHistory(undefined, fetched)).toBe(fetched)
  })

  it('keeps nothing when a fetch vouches for nothing', () => {
    expect(widerHistory(undefined, upTo(undefined))).toBeUndefined()
  })

  it('replaces what is kept with a fetch that reaches as far or further', () => {
    const kept = upTo(100)
    const further = upTo(150)
    const same = upTo(100)
    expect(widerHistory(kept, further)).toBe(further)
    expect(widerHistory(kept, same)).toBe(same)
  })

  it('keeps what it has over a fetch that reaches less far, or nowhere', () => {
    // A reused response, older than the one already kept.
    const kept = upTo(100)
    expect(widerHistory(kept, upTo(60))).toBe(kept)
    expect(widerHistory(kept, upTo(undefined))).toBe(kept)
  })
})

describe('getFittedProbDomain', () => {
  it('snaps outward to the gridlines', () => {
    expect(getFittedProbDomain(0.42, 0.58, 20)).toEqual([0.4, 0.6])
    expect(getFittedProbDomain(0.02, 0.97, 20)).toEqual([0, 1])
    expect(getFittedProbDomain(0.52, 0.52, 20)).toEqual([0.5, 0.55])
  })

  it('shows the whole range when there is nothing to fit to', () => {
    expect(getFittedProbDomain(Infinity, -Infinity, 20)).toEqual([0, 1])
    expect(getFittedProbDomain(NaN, 0.5, 20)).toEqual([0, 1])
    expect(getFittedProbDomain(0.5, NaN, 20)).toEqual([0, 1])
  })

  it('gives a flat line on a gridline an axis with height', () => {
    const [low, high] = getFittedProbDomain(0.5, 0.5, 20)
    expect(low).toBeCloseTo(0.45)
    expect(high).toBeCloseTo(0.55)
  })

  it('stays within 0 and 1 when it opens a flat line at either end', () => {
    expect(getFittedProbDomain(0, 0, 20)).toEqual([0, 0.05])
    expect(getFittedProbDomain(1, 1, 20)).toEqual([0.95, 1])
  })

  it('always returns a range with height, inside 0 to 1, that holds the lines', () => {
    let seed = 5
    const random = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let trial = 0; trial < 2000; trial++) {
      const a = Math.floor(random() * 1001) / 1000
      const b = Math.floor(random() * 1001) / 1000
      const [min, max] = [Math.min(a, b), Math.max(a, b)]
      const [low, high] = getFittedProbDomain(min, max, 20)
      expect(high).toBeGreaterThan(low)
      expect(low).toBeGreaterThanOrEqual(0)
      expect(high).toBeLessThanOrEqual(1)
      expect(low).toBeLessThanOrEqual(min)
      expect(high).toBeGreaterThanOrEqual(max)
    }
  })
})

const isInTimeOrder = (line: { x: number }[]) =>
  line.every((p, i) => i === 0 || line[i - 1].x <= p.x)

// A small repeatable random number generator.
const makeRandom = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647
  return seed / 2147483647
}

describe('thinPoints', () => {
  const run = (count: number) =>
    Array.from({ length: count }, (_, i) => ({ x: i * 10, y: (i % 7) / 10 }))

  it('keeps the first, last, lowest and highest point of each run', () => {
    const points = [
      { x: 1, y: 0.5 },
      { x: 2, y: 0.9 },
      { x: 3, y: 0.1 },
      { x: 4, y: 0.4 },
      { x: 5, y: 0.6 },
      // Second run.
      { x: 6, y: 0.3 },
      { x: 7, y: 0.3 },
      { x: 8, y: 0.2 },
      { x: 9, y: 0.8 },
      { x: 10, y: 0.7 },
    ]
    expect(thinPoints(points, 2).map((p) => p.x)).toEqual([
      1, 2, 3, 5, 6, 8, 9, 10,
    ])
  })

  it('keeps only points it was given, in the order they were in', () => {
    const points = run(500)
    const thinned = thinPoints(points, 20)
    expect(thinned.every((p) => points.includes(p))).toBe(true)
    expect(isInTimeOrder(thinned)).toBe(true)
    expect(thinned.length).toBeLessThanOrEqual(80)
    expect(thinned[0]).toBe(points[0])
    expect(thinned[thinned.length - 1]).toBe(points[points.length - 1])
  })

  it('places nothing at a time the line was not at, however the times are spread', () => {
    // Evenly spaced points and then one far later. Thinning by equal
    // stretches of time would leave made-up points in the gap.
    const points = [...run(500), { x: 1_000_000, y: 0.25 }]
    const thinned = thinPoints(points, 60)
    const times = new Set(points.map((p) => p.x))
    expect(thinned.every((p) => times.has(p.x))).toBe(true)
    expect(isInTimeOrder(thinned)).toBe(true)
    expect(thinned[thinned.length - 1]).toEqual({ x: 1_000_000, y: 0.25 })
  })

  it('keeps every point when there are as many runs as points', () => {
    const points = run(9)
    expect(thinPoints(points, 9)).toEqual(points)
    expect(thinPoints(points, 100)).toEqual(points)
  })

  it('treats no runs as one', () => {
    expect(thinPoints(run(50), 0).length).toBeLessThanOrEqual(4)
    expect(thinPoints(run(50), -3).length).toBeLessThanOrEqual(4)
    expect(thinPoints([], 5)).toEqual([])
  })
})

describe('addLivePoints', () => {
  const run = (count: number) =>
    Array.from({ length: count }, (_, i) => ({ x: i, y: (i % 7) / 10 }))
  const lines = {
    a: [
      { x: 10, y: 0.1 },
      { x: 20, y: 0.2 },
    ],
    b: [{ x: 10, y: 0.5 }],
  }

  it('adds points to the end and leaves the lines it was given alone', () => {
    const result = addLivePoints(lines, { a: [{ x: 30, y: 0.3 }] }, 100)
    expect(result.a).toEqual([
      { x: 10, y: 0.1 },
      { x: 20, y: 0.2 },
      { x: 30, y: 0.3 },
    ])
    expect(lines.a).toHaveLength(2)
  })

  it('keeps the array of a line that gained nothing', () => {
    const result = addLivePoints(lines, { a: [{ x: 30, y: 0.3 }] }, 100)
    expect(result.b).toBe(lines.b)
    expect(result).not.toBe(lines)
  })

  it('returns the same object when there is nothing to add', () => {
    expect(addLivePoints(lines, {}, 100)).toBe(lines)
    expect(addLivePoints(lines, { a: [] }, 100)).toBe(lines)
  })

  it('starts a line for an answer it had none for', () => {
    const result = addLivePoints(lines, { c: [{ x: 5, y: 0.9 }] }, 100)
    expect(result.c).toEqual([{ x: 5, y: 0.9 }])
    expect(Object.keys(result).sort()).toEqual(['a', 'b', 'c'])
  })

  it('leaves no point out as a repeat', () => {
    // An answer moved to 60% and back to 70% within one millisecond, having
    // been at 70% before. Dropping the second 70% as a repeat would leave the
    // line at 60%.
    const live = { a: [{ x: 6000, y: 0.7 }] }
    const result = addLivePoints(
      live,
      {
        a: [
          { x: 6000, y: 0.6 },
          { x: 6000, y: 0.7 },
        ],
      },
      100
    )
    expect(result.a.map((p) => p.y)).toEqual([0.7, 0.6, 0.7])
    expect(getStepValueAt(result.a, 6000)).toBe(0.7)
  })

  it('puts a point that arrives late where it belongs in time', () => {
    const result = addLivePoints(lines, { a: [{ x: 15, y: 0.15 }] }, 100)
    expect(result.a.map((p) => p.x)).toEqual([10, 15, 20])
  })

  it('keeps points of one time in the order they came when it reorders', () => {
    const result = addLivePoints(
      { a: [{ x: 20, y: 0.2 }] },
      {
        a: [
          { x: 30, y: 0.3 },
          { x: 30, y: 0.35 },
          { x: 10, y: 0.1 },
          { x: 30, y: 0.4 },
        ],
      },
      100
    )
    expect(result.a).toEqual([
      { x: 10, y: 0.1 },
      { x: 20, y: 0.2 },
      { x: 30, y: 0.3 },
      { x: 30, y: 0.35 },
      { x: 30, y: 0.4 },
    ])
  })

  it('keeps a line that outgrows the limit to a bounded length', () => {
    let live: { [id: string]: { x: number; y: number }[] } = {}
    let thinnings = 0
    for (let i = 0; i < 5000; i++) {
      const lengthBefore = live.a?.length ?? 0
      live = addLivePoints(live, { a: [{ x: i, y: (i % 7) / 10 }] }, 100)
      expect(live.a.length).toBeLessThanOrEqual(100)
      if (live.a.length <= lengthBefore) {
        // The line was just thinned. Its newest half is as it came.
        thinnings++
        expect(live.a.slice(-50)).toEqual(run(i + 1).slice(-50))
      }
    }
    expect(thinnings).toBeGreaterThan(10)
    expect(isInTimeOrder(live.a)).toBe(true)
    // Every point kept is one that was added.
    expect(live.a.every((p) => p.y === (p.x % 7) / 10)).toBe(true)
    // The thinned part still spans the levels the line reached.
    expect(Math.min(...live.a.map((p) => p.y))).toBe(0)
    expect(Math.max(...live.a.map((p) => p.y))).toBe(0.6)
  })

  it('thins without making points up or putting them out of order', () => {
    // 501 older points, the last of them long after the rest, then 500 newer.
    const older = [
      ...Array.from({ length: 500 }, (_, i) => ({ x: i, y: (i % 9) / 10 })),
      { x: 10_001, y: 0.45 },
    ]
    const newer = Array.from({ length: 500 }, (_, i) => ({
      x: 10_002 + i,
      y: (i % 5) / 10,
    }))
    const result = addLivePoints(
      { a: [...older, ...newer.slice(0, 499)] },
      { a: [newer[499]] },
      1000
    )
    const added = new Set([...older, ...newer].map((p) => `${p.x}:${p.y}`))
    expect(result.a.length).toBeLessThanOrEqual(1000)
    expect(result.a.every((p) => added.has(`${p.x}:${p.y}`))).toBe(true)
    expect(isInTimeOrder(result.a)).toBe(true)
    // The newest half is as it came, and the older part ends where it ended.
    expect(result.a.slice(-500)).toEqual(newer)
    expect(result.a[result.a.length - 501]).toEqual({ x: 10_001, y: 0.45 })
  })

  it('touches only the lines that gain a point', () => {
    const quiet = run(150)
    const named = run(150)
    const live = { quiet, named, busy: run(100) }
    const result = addLivePoints(
      live,
      { busy: [{ x: 100, y: 0.5 }], named: [] },
      100
    )
    // Both are over the limit. Neither gained a point, so both are as they
    // were, whether or not the additions name them.
    expect(result.quiet).toBe(quiet)
    expect(result.named).toBe(named)
    expect(result.busy.length).toBeLessThanOrEqual(100)
  })

  it('holds to any limit, and always keeps the newest point', () => {
    for (let max = 1; max <= 40; max++) {
      let live: { [id: string]: { x: number; y: number }[] } = {}
      for (let i = 0; i < 200; i++) {
        live = addLivePoints(live, { a: [{ x: i, y: (i % 11) / 20 }] }, max)
        expect(live.a.length).toBeLessThanOrEqual(max)
        expect(live.a[live.a.length - 1].x).toBe(i)
        expect(isInTimeOrder(live.a)).toBe(true)
      }
    }
  })
})

describe('continueLine', () => {
  const points = [
    { x: 10, y: 0.1 },
    { x: 20, y: 0.2 },
  ]

  it('adds the live points made after the last bet of the history', () => {
    expect(
      continueLine(points, 20, [
        { x: 15, y: 0.9 },
        { x: 20, y: 0.8 },
        { x: 21, y: 0.3 },
        { x: 30, y: 0.4 },
      ])
    ).toEqual([
      { x: 10, y: 0.1 },
      { x: 20, y: 0.2 },
      { x: 21, y: 0.3 },
      { x: 30, y: 0.4 },
    ])
  })

  it('goes by the last bet of the history, not by the last point of the line', () => {
    // The history ran to 50. This answer last moved at 20, and the live feed
    // repeats a move of it from before 50, which the history has.
    expect(
      continueLine(points, 50, [
        { x: 40, y: 0.9 },
        { x: 60, y: 0.6 },
      ])
    ).toEqual([...points, { x: 60, y: 0.6 }])
  })

  it('adds every live point to a line from a history with no bets', () => {
    const start = [{ x: 0, y: 0.5 }]
    const live = [
      { x: 5, y: 0.6 },
      { x: 9, y: 0.7 },
    ]
    expect(continueLine(start, undefined, live)).toEqual([...start, ...live])
    expect(continueLine([], undefined, live)).toEqual(live)
  })

  it('returns the line itself when there is nothing to add', () => {
    expect(continueLine(points, 20, undefined)).toBe(points)
    expect(continueLine(points, 20, [])).toBe(points)
    expect(continueLine(points, 20, [{ x: 20, y: 0.8 }])).toBe(points)
  })

  it('keeps two moves made in one millisecond in the order they were made', () => {
    // The history ends before them, so both come from the live feed.
    const line = continueLine([{ x: 5000, y: 0.7 }], 5999, [
      { x: 6000, y: 0.6 },
      { x: 6000, y: 0.7 },
    ])
    expect(line.map((p) => p.y)).toEqual([0.7, 0.6, 0.7])
    expect(getStepValueAt(line, 6000)).toBe(0.7)
    // The history has them, so the live feed's copies are not added.
    const history = [
      { x: 5000, y: 0.7 },
      { x: 6000, y: 0.6 },
      { x: 6000, y: 0.7 },
    ]
    expect(continueLine(history, 6000, [{ x: 6000, y: 0.7 }])).toBe(history)
  })

  it('drops filler the line has after the first live point', () => {
    // Thinning left a point at 25 holding the level of the last bet, at 20.
    const thinned = [...points, { x: 25, y: 0.2 }]
    const line = continueLine(thinned, 20, [
      { x: 22, y: 0.3 },
      { x: 40, y: 0.35 },
    ])
    expect(line).toEqual([
      { x: 10, y: 0.1 },
      { x: 20, y: 0.2 },
      { x: 22, y: 0.3 },
      { x: 40, y: 0.35 },
    ])
    expect(isInTimeOrder(line)).toBe(true)
    expect(getStepValueAt(line, 30)).toBe(0.3)
  })

  it('keeps filler that comes before the first live point', () => {
    const thinned = [...points, { x: 25, y: 0.2 }]
    expect(continueLine(thinned, 20, [{ x: 25, y: 0.3 }])).toEqual([
      ...thinned,
      { x: 25, y: 0.3 },
    ])
    expect(continueLine(thinned, 20, [{ x: 40, y: 0.3 }])).toEqual([
      ...thinned,
      { x: 40, y: 0.3 },
    ])
  })

  it('keeps filler at the time of the first live point and drops what is after', () => {
    const thinned = [...points, { x: 25, y: 0.2 }, { x: 30, y: 0.2 }]
    expect(continueLine(thinned, 20, [{ x: 25, y: 0.3 }])).toEqual([
      ...points,
      { x: 25, y: 0.2 },
      { x: 25, y: 0.3 },
    ])
  })
})

describe('getWholeHistoryLines', () => {
  const data = {
    a: [{ x: 10, y: 0.1 }],
    c: [{ x: 10, y: 0.3 }],
  }

  it('gives a line to each answer the history was made with', () => {
    const lines = getWholeHistoryLines({
      data,
      answerIds: ['a', 'b'],
      latestBetTime: 70,
    })
    expect(Object.keys(lines).sort()).toEqual(['a', 'b'])
    expect(lines.a.points).toBe(data.a)
    // Nothing came back for b: an empty line, which still counts as one.
    expect(lines.b.points).toEqual([])
  })

  it('gives none to an answer the history was not made with', () => {
    const lines = getWholeHistoryLines({
      data,
      answerIds: ['a'],
      latestBetTime: 70,
    })
    expect(lines.c).toBeUndefined()
  })

  it('records the last bet of the history on every line', () => {
    const lines = getWholeHistoryLines({
      data,
      answerIds: ['a', 'b'],
      latestBetTime: 70,
    })
    expect(lines.a.latestBetTime).toBe(70)
    expect(lines.b.latestBetTime).toBe(70)
    expect(
      getWholeHistoryLines({ data, answerIds: ['a'], latestBetTime: undefined })
        .a.latestBetTime
    ).toBeUndefined()
  })
})

describe('withFurtherLines', () => {
  const line = (latestBetTime: number | undefined, y = 0.5) => ({
    points: [{ x: 1, y }],
    latestBetTime,
  })

  it('takes a line for an answer that has none', () => {
    const kept = { a: line(50) }
    const offered = { b: line(30) }
    expect(withFurtherLines(kept, offered)).toEqual({ a: kept.a, b: offered.b })
    expect(withFurtherLines({}, { b: line(undefined) }).b).toBeDefined()
  })

  it('replaces a line with one from a history that reaches as far', () => {
    const kept = { a: line(50, 0.1) }
    expect(withFurtherLines(kept, { a: line(60, 0.2) }).a.latestBetTime).toBe(
      60
    )
    const same = line(50, 0.3)
    expect(withFurtherLines(kept, { a: same }).a).toBe(same)
  })

  it('keeps a line when the one offered is from an older history', () => {
    // The whole history on the chart runs to 5000 and has a move at 4000. An
    // answer without a line gets one fetched, and what comes back is an older
    // copy that ends at 3000. The first answer keeps the line it has, and the
    // new answer takes the only line there is for it.
    const kept = {
      a: {
        points: [
          { x: 1000, y: 0.2 },
          { x: 4000, y: 0.4 },
        ],
        latestBetTime: 5000,
      },
    }
    const offered = {
      a: { points: [{ x: 1000, y: 0.2 }], latestBetTime: 3000 },
      b: { points: [{ x: 2000, y: 0.6 }], latestBetTime: 3000 },
    }
    const result = withFurtherLines(kept, offered)
    expect(result.a).toBe(kept.a)
    expect(result.b).toBe(offered.b)
  })

  it('counts a history with no bets as reaching less far than any with one', () => {
    expect(withFurtherLines({ a: line(0) }, { a: line(undefined) }).a).toEqual(
      line(0)
    )
    const offered = line(0, 0.9)
    expect(withFurtherLines({ a: line(undefined) }, { a: offered }).a).toBe(
      offered
    )
    const empty = line(undefined, 0.9)
    expect(withFurtherLines({ a: line(undefined) }, { a: empty }).a).toBe(empty)
  })

  it('returns the lines it was given when it takes none, and never changes them', () => {
    const kept = { a: line(50) }
    expect(withFurtherLines(kept, {})).toBe(kept)
    expect(withFurtherLines(kept, { a: line(40) })).toBe(kept)
    const result = withFurtherLines(kept, { a: line(60), b: line(60) })
    expect(result).not.toBe(kept)
    expect(Object.keys(kept)).toEqual(['a'])
    expect(kept.a.latestBetTime).toBe(50)
  })

  it('ends on the same lines whichever of two histories arrives first', () => {
    const random = makeRandom(11)
    for (let trial = 0; trial < 200; trial++) {
      const history = (tag: number) => {
        const latestBetTime =
          random() < 0.2 ? undefined : Math.floor(random() * 5)
        const lines: { [id: string]: ReturnType<typeof line> } = {}
        for (const id of ['a', 'b', 'c'])
          if (random() < 0.7) lines[id] = line(latestBetTime, tag)
        return lines
      }
      const first = history(1)
      const second = history(2)
      const oneWay = withFurtherLines(withFurtherLines({}, first), second)
      const otherWay = withFurtherLines(withFurtherLines({}, second), first)
      for (const id of ['a', 'b', 'c']) {
        // Each answer ends with a line from the history that reaches further.
        // Only when the two reach equally far does the order decide.
        const reach = (l?: { latestBetTime: number | undefined }) =>
          l ? l.latestBetTime ?? -Infinity : undefined
        expect(reach(oneWay[id])).toBe(reach(otherWay[id]))
        const best = [first[id], second[id]]
          .filter((l) => l !== undefined)
          .map((l) => reach(l) as number)
        expect(reach(oneWay[id])).toBe(
          best.length ? Math.max(...best) : undefined
        )
      }
    }
  })
})

describe('getWholeHistoryPoints', () => {
  const lines = {
    a: { points: [{ x: 10, y: 0.1 }], latestBetTime: 50 },
    // From an older history.
    b: { points: [{ x: 10, y: 0.5 }], latestBetTime: 20 },
    c: { points: [{ x: 10, y: 0.3 }], latestBetTime: 50 },
  }
  const live = {
    a: [
      { x: 40, y: 0.15 },
      { x: 60, y: 0.2 },
    ],
    b: [
      { x: 40, y: 0.45 },
      { x: 60, y: 0.4 },
    ],
    d: [{ x: 60, y: 0.05 }],
  }

  it('carries each line on from the last bet of its own history', () => {
    const points = getWholeHistoryPoints(lines, live)
    expect(points.a).toEqual([
      { x: 10, y: 0.1 },
      { x: 60, y: 0.2 },
    ])
    expect(points.b).toEqual([
      { x: 10, y: 0.5 },
      { x: 40, y: 0.45 },
      { x: 60, y: 0.4 },
    ])
  })

  it('keeps the array of a line with nothing live to add', () => {
    expect(getWholeHistoryPoints(lines, live).c).toBe(lines.c.points)
    expect(getWholeHistoryPoints(lines, {}).a).toBe(lines.a.points)
  })

  it('draws an answer that has no line from its live points alone', () => {
    expect(getWholeHistoryPoints(lines, live).d).toBe(live.d)
    expect(Object.keys(getWholeHistoryPoints(lines, live)).sort()).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
  })

  it('draws every move once, in order, when history and live feed overlap', () => {
    // A market's moves, some sharing a millisecond. The history holds those
    // up to a cut, the live feed those from an earlier moment on, so the two
    // overlap. Together they must give exactly the market's moves.
    const random = makeRandom(5)
    for (let trial = 0; trial < 200; trial++) {
      let time = 0
      const moves = Array.from({ length: 30 }, () => {
        if (random() < 0.7) time += 1 + Math.floor(random() * 3)
        return { x: time, y: Math.floor(random() * 5) / 5 }
      })
      const times = moves.map((m) => m.x)
      const cut = times[Math.floor(random() * times.length)]
      const liveFrom = times[Math.floor(random() * times.length)]
      // The live feed must not start after the first move the history lacks.
      if (liveFrom > cut) continue
      const history = moves.filter((m) => m.x <= cut)
      const delivered = moves.filter((m) => m.x >= liveFrom)
      const drawn = getWholeHistoryPoints(
        { a: { points: history, latestBetTime: cut } },
        { a: delivered }
      )
      expect(drawn.a).toEqual(moves)
    }
  })
})

describe('getUncoveredAnswerIds', () => {
  const knownIds = ['a', 'b', 'c', 'd']
  const line = { points: [], latestBetTime: undefined }

  it('is empty when every answer needed has a line', () => {
    expect(
      getUncoveredAnswerIds({
        neededIds: ['a', 'b'],
        knownIds,
        lines: { a: line, b: line, c: line },
      })
    ).toEqual([])
  })

  it('lists the answers that have none', () => {
    expect(
      getUncoveredAnswerIds({
        neededIds: ['a', 'b', 'c'],
        knownIds,
        lines: { a: line },
      })
    ).toEqual(['b', 'c'])
  })

  it('does not take one history as covering answers it was not made with', () => {
    // The first fetch went out with the page's shortened answer list. The
    // user then picks an answer from the full list.
    expect(
      getUncoveredAnswerIds({
        neededIds: ['d'],
        knownIds,
        lines: getWholeHistoryLines({
          data: {},
          answerIds: ['a', 'b', 'c'],
          latestBetTime: 9,
        }),
      })
    ).toEqual(['d'])
  })

  it('counts an answer with an empty line as covered', () => {
    // Otherwise an answer nobody has bet on would be fetched for ever.
    expect(
      getUncoveredAnswerIds({
        neededIds: ['c'],
        knownIds,
        lines: getWholeHistoryLines({
          data: {},
          answerIds: ['a', 'b', 'c'],
          latestBetTime: undefined,
        }),
      })
    ).toEqual([])
  })

  it('ignores an answer the market does not have', () => {
    expect(
      getUncoveredAnswerIds({ neededIds: ['gone'], knownIds, lines: {} })
    ).toEqual([])
  })

  it('is not fooled by an answer id that every object answers to', () => {
    expect(
      getUncoveredAnswerIds({
        neededIds: ['constructor', 'toString'],
        knownIds: ['constructor', 'toString'],
        lines: {},
      })
    ).toEqual(['constructor', 'toString'])
  })
})

describe('latestDefined', () => {
  it('is the latest of the times that are known', () => {
    expect(latestDefined([undefined, 5, 9, undefined, 7])).toBe(9)
    expect(latestDefined([0])).toBe(0)
  })

  it('is undefined when none is known', () => {
    expect(latestDefined([])).toBeUndefined()
    expect(latestDefined([undefined, undefined])).toBeUndefined()
  })
})

describe('isBehindLastBet', () => {
  const line = (latestBetTime: number | undefined) => ({
    points: [],
    latestBetTime,
  })
  const lines = { a: line(500), b: line(300), empty: line(undefined) }

  it('is false while the page knows of no bet', () => {
    expect(
      isBehindLastBet({
        lines,
        answerIds: ['a', 'b', 'empty'],
        knownLastBetTime: undefined,
      })
    ).toBe(false)
  })

  it('is false when every line on the chart reaches the last bet known', () => {
    expect(
      isBehindLastBet({ lines, answerIds: ['a'], knownLastBetTime: 500 })
    ).toBe(false)
    expect(
      isBehindLastBet({ lines, answerIds: ['a', 'b'], knownLastBetTime: 300 })
    ).toBe(false)
  })

  it('is true when a line on the chart ends before the last bet known', () => {
    expect(
      isBehindLastBet({ lines, answerIds: ['a'], knownLastBetTime: 501 })
    ).toBe(true)
    // One line from an older history is enough.
    expect(
      isBehindLastBet({ lines, answerIds: ['a', 'b'], knownLastBetTime: 500 })
    ).toBe(true)
  })

  it('leaves out lines that are not on the chart', () => {
    expect(
      isBehindLastBet({ lines, answerIds: ['a'], knownLastBetTime: 400 })
    ).toBe(false)
  })

  it('does not count an answer that has no line yet', () => {
    expect(
      isBehindLastBet({ lines, answerIds: ['new'], knownLastBetTime: 900 })
    ).toBe(false)
    expect(
      isBehindLastBet({ lines: {}, answerIds: ['a'], knownLastBetTime: 900 })
    ).toBe(false)
  })

  it('takes a line from a history with no bets as behind the first bet', () => {
    // The page was rendered before anyone bet. The first bet must not be
    // missed for want of an earlier one to measure from.
    expect(
      isBehindLastBet({ lines, answerIds: ['empty'], knownLastBetTime: 0 })
    ).toBe(true)
  })
})

describe('hasUndeliveredBet', () => {
  const lines = { a: { points: [], latestBetTime: 500 } }
  const base = { lines, answerIds: ['a'] }

  it('is false while the page feed holds nothing', () => {
    expect(
      hasUndeliveredBet({
        ...base,
        latestPageBetTime: undefined,
        latestLiveBetTime: undefined,
      })
    ).toBe(false)
  })

  it('is true for a bet the live feed did not deliver and the line lacks', () => {
    // Made between the server render and the page subscribing.
    expect(
      hasUndeliveredBet({
        ...base,
        latestPageBetTime: 800,
        latestLiveBetTime: undefined,
      })
    ).toBe(true)
    // Made while the connection was down, after a bet that was delivered.
    expect(
      hasUndeliveredBet({
        ...base,
        latestPageBetTime: 800,
        latestLiveBetTime: 700,
      })
    ).toBe(true)
  })

  it('is false for a bet the live feed delivered', () => {
    expect(
      hasUndeliveredBet({
        ...base,
        latestPageBetTime: 800,
        latestLiveBetTime: 800,
      })
    ).toBe(false)
  })

  it('is false for a bet the history of the line already holds', () => {
    expect(
      hasUndeliveredBet({
        ...base,
        latestPageBetTime: 500,
        latestLiveBetTime: undefined,
      })
    ).toBe(false)
  })

  it('is false when the answer on the chart has no line', () => {
    expect(
      hasUndeliveredBet({
        lines,
        answerIds: ['b'],
        latestPageBetTime: 800,
        latestLiveBetTime: undefined,
      })
    ).toBe(false)
  })
})

describe('isOnItsWay', () => {
  const requests = [
    { answerIds: ['a', 'b'], max: 501 },
    { answerIds: ['a', 'b', 'c'], max: 301 },
  ]

  it('is false when nothing is on its way', () => {
    expect(isOnItsWay([], { answerIds: [] })).toBe(false)
    expect(isOnItsWay([], { answerIds: ['a'], upTo: 0 })).toBe(false)
  })

  it('is true when a request was made with every answer wanted', () => {
    expect(isOnItsWay(requests, { answerIds: ['a', 'b'] })).toBe(true)
    expect(isOnItsWay(requests, { answerIds: ['c'] })).toBe(true)
    expect(isOnItsWay(requests, { answerIds: [] })).toBe(true)
  })

  it('is false when no request was made with an answer wanted', () => {
    expect(isOnItsWay(requests, { answerIds: ['a', 'd'] })).toBe(false)
  })

  it('needs the request to ask for the bets up to the time wanted', () => {
    expect(isOnItsWay(requests, { answerIds: [], upTo: 500 })).toBe(true)
    // A bet has been made since both were sent.
    expect(isOnItsWay(requests, { answerIds: [], upTo: 501 })).toBe(false)
  })

  it('needs one request to do for both the answers and the time', () => {
    // c was only asked for up to 300.
    expect(isOnItsWay(requests, { answerIds: ['c'], upTo: 400 })).toBe(false)
    expect(isOnItsWay(requests, { answerIds: ['c'], upTo: 300 })).toBe(true)
  })
})

describe('withLivePoints', () => {
  const data = { a: [{ x: 100, y: 0.4 }] }
  const live = {
    a: [
      { x: 50, y: 0.1 },
      { x: 100, y: 0.45 },
      { x: 150, y: 0.5 },
    ],
    b: [{ x: 160, y: 0.6 }],
  }
  const stretch = {
    min: 90,
    max: 120,
    data,
    answerIds: ['a'],
    latestBetTime: 100,
  }

  it('adds the live points made after the last bet that came back', () => {
    const fetched = { ...stretch, reachedLastBet: true }
    expect(withLivePoints(fetched, live)).toEqual({
      a: [
        { x: 100, y: 0.4 },
        { x: 150, y: 0.5 },
      ],
      b: [{ x: 160, y: 0.6 }],
    })
  })

  it('adds the live points made after the start of a stretch that came back empty', () => {
    const fetched = {
      ...stretch,
      data: {},
      latestBetTime: undefined,
      reachedLastBet: true,
    }
    expect(
      withLivePoints(fetched, {
        a: [
          { x: 50, y: 0.1 },
          { x: 90, y: 0.2 },
          { x: 91, y: 0.3 },
        ],
      })
    ).toEqual({ a: [{ x: 91, y: 0.3 }] })
  })

  it('adds nothing to a stretch that ended before the last bet', () => {
    const fetched = { ...stretch, reachedLastBet: false }
    expect(withLivePoints(fetched, live)).toBe(data)
  })

  it('returns the fetched points themselves when nothing live applies', () => {
    const fetched = { ...stretch, reachedLastBet: true }
    expect(withLivePoints(fetched, {})).toBe(data)
    expect(withLivePoints(fetched, { a: [{ x: 50, y: 0.1 }] })).toBe(data)
    expect(withLivePoints(fetched, { b: [{ x: 50, y: 0.1 }] })).toBe(data)
  })

  it('keeps the lines that gain nothing as they are', () => {
    const both = { ...data, c: [{ x: 95, y: 0.2 }] }
    const fetched = { ...stretch, data: both, reachedLastBet: true }
    const result = withLivePoints(fetched, live)
    expect(result.c).toBe(both.c)
    expect(both.a).toHaveLength(1)
  })
})

describe('movedProbability', () => {
  it('counts a row that moved an answer, shares or not', () => {
    expect(
      movedProbability({ answerId: 'a', probBefore: 0.4, probAfter: 0.5 })
    ).toBe(true)
  })

  it('does not count a row that left the probability where it was', () => {
    expect(
      movedProbability({ answerId: 'a', probBefore: 0.4, probAfter: 0.4 })
    ).toBe(false)
  })

  it('does not count a row with no answer or a broken probability', () => {
    expect(movedProbability({ probBefore: 0.4, probAfter: 0.5 })).toBe(false)
    expect(
      movedProbability({ answerId: 'a', probBefore: 0.4, probAfter: NaN })
    ).toBe(false)
  })
})

describe('chooseChartPoints', () => {
  const wholeHistory = { a: [{ x: 10, y: 0.1 }] }
  const window = { a: [{ x: 500, y: 0.5 }] }
  const live = { a: [{ x: 990, y: 0.9 }] }
  const fetched = (
    min: number,
    max: number,
    reachedLastBet: boolean
  ): FetchedMultiPoints => ({
    min,
    max,
    reachedLastBet,
    data: window,
    answerIds: ['a'],
    latestBetTime: 500,
  })
  const base = {
    isZoomed: true,
    wholeHistory,
    hasWholeHistory: true,
    live,
    view: { min: 400, max: 1000 },
    createdTime: 0,
  }

  it('draws the whole history when the chart is not zoomed', () => {
    expect(
      chooseChartPoints({
        ...base,
        isZoomed: false,
        zoomed: fetched(399, 1001, true),
      })
    ).toBe(wholeHistory)
  })

  it('draws the whole history until a window has been fetched', () => {
    expect(chooseChartPoints({ ...base, zoomed: undefined })).toBe(wholeHistory)
  })

  it('draws a fetched window that covers the view, with the live bets since', () => {
    expect(
      chooseChartPoints({ ...base, zoomed: fetched(399, 900, true) })
    ).toEqual({
      a: [
        { x: 500, y: 0.5 },
        { x: 990, y: 0.9 },
      ],
    })
  })

  it('adds no live bets to a window that ended before the last bet', () => {
    expect(
      chooseChartPoints({
        ...base,
        view: { min: 400, max: 800 },
        zoomed: fetched(399, 801, false),
      })
    ).toBe(window)
  })

  it('falls back to the whole history when the view has moved outside the window', () => {
    // Panned left of what was fetched.
    expect(
      chooseChartPoints({
        ...base,
        view: { min: 200, max: 800 },
        zoomed: fetched(399, 1001, true),
      })
    ).toBe(wholeHistory)
    // Panned right of a window that stopped in the past.
    expect(
      chooseChartPoints({
        ...base,
        view: { min: 400, max: 900 },
        zoomed: fetched(399, 801, false),
      })
    ).toBe(wholeHistory)
  })

  it('counts a window that starts at the market as covering a view that starts before it', () => {
    expect(
      chooseChartPoints({
        ...base,
        createdTime: 300,
        view: { min: 100, max: 800 },
        zoomed: fetched(299, 801, false),
      })
    ).toBe(window)
  })

  it('draws any fetched window when there is no whole history to fall back on', () => {
    expect(
      chooseChartPoints({
        ...base,
        hasWholeHistory: false,
        view: { min: 200, max: 800 },
        zoomed: fetched(399, 801, false),
      })
    ).toBe(window)
  })

  it('draws the whole history before the chart is laid out', () => {
    expect(
      chooseChartPoints({
        ...base,
        view: undefined,
        zoomed: fetched(399, 1001, true),
      })
    ).toBe(wholeHistory)
  })
})

describe('getZoomWindow', () => {
  const base = { createdTime: 1_000_000, leadMs: 1000 }

  it('runs from a little before the left edge to a millisecond past the last bet', () => {
    expect(
      getZoomWindow({
        ...base,
        view: { min: 5_000_000, max: 9_000_000 },
        lastBetTime: 8_000_000,
      })
    ).toEqual({ min: 4_999_000, max: 8_000_001, reachedLastBet: true })
  })

  it('stops at the right edge of a view that ends before the last bet', () => {
    expect(
      getZoomWindow({
        ...base,
        view: { min: 5_000_000, max: 6_000_000 },
        lastBetTime: 8_000_000,
      })
    ).toEqual({ min: 4_999_000, max: 6_000_001, reachedLastBet: false })
  })

  it('counts a view that ends exactly on the last bet as reaching it', () => {
    expect(
      getZoomWindow({
        ...base,
        view: { min: 5_000_000, max: 8_000_000 },
        lastBetTime: 8_000_000,
      }).reachedLastBet
    ).toBe(true)
  })

  it('starts no earlier than a little before the market', () => {
    expect(
      getZoomWindow({
        ...base,
        view: { min: 0, max: 9_000_000 },
        lastBetTime: 8_000_000,
      }).min
    ).toBe(999_000)
  })

  it('decides whether it reaches the last bet against the same bet as its end', () => {
    // A bet lands while the fetch is waiting to be sent. Worked out again
    // with the new last bet, the window ends past it and says so. Its end must
    // never come from one moment and the flag from another.
    for (const lastBetTime of [8_000_000, 8_000_050]) {
      const w = getZoomWindow({
        ...base,
        view: { min: 5_000_000, max: 9_000_000 },
        lastBetTime,
      })
      expect(w.max).toBe(lastBetTime + 1)
      expect(w.reachedLastBet).toBe(true)
    }
  })
})

describe('the whole history through a session', () => {
  // The helpers put together the way the chart puts them together.
  const drawn = (
    server: Parameters<typeof getWholeHistoryLines>[0],
    fetches: Parameters<typeof getWholeHistoryLines>[0][],
    live: { [id: string]: { x: number; y: number }[] }
  ) => {
    let fetched: WholeHistoryLines = {}
    for (const f of fetches)
      fetched = withFurtherLines(fetched, getWholeHistoryLines(f))
    const lines = withFurtherLines(getWholeHistoryLines(server), fetched)
    return { lines, points: getWholeHistoryPoints(lines, live) }
  }
  const server = {
    data: {
      a: [
        { x: 1000, y: 0.5 },
        { x: 5000, y: 0.55 },
      ],
      b: [{ x: 1000, y: 0.5 }],
    },
    answerIds: ['a', 'b'],
    latestBetTime: 5000,
  }
  // Delivered live since the page opened. The bet at 5500 was made before
  // the page subscribed, so it is not among them.
  const live = {
    a: [{ x: 6000, y: 0.7 }],
    b: [{ x: 6000, y: 0.3 }],
  }
  const refreshed = {
    data: {
      a: [
        { x: 1000, y: 0.5 },
        { x: 5000, y: 0.55 },
        { x: 5500, y: 0.6 },
        { x: 6000, y: 0.7 },
      ],
      b: [
        { x: 1000, y: 0.5 },
        { x: 5500, y: 0.4 },
        { x: 6000, y: 0.3 },
      ],
    },
    answerIds: ['a', 'b'],
    latestBetTime: 6000,
  }

  it('draws the rendered history carried on by the live bets', () => {
    const { lines, points } = drawn(server, [], live)
    expect(points.a.map((p) => p.x)).toEqual([1000, 5000, 6000])
    // The page knows of the bet at 6000, so the lines are behind and the
    // next moment that checks fetches the history again.
    expect(
      isBehindLastBet({ lines, answerIds: ['a', 'b'], knownLastBetTime: 6000 })
    ).toBe(true)
  })

  it('draws a refreshed history with each bet once, the missed one included', () => {
    const { lines, points } = drawn(server, [refreshed], live)
    expect(points).toEqual(refreshed.data)
    expect(
      isBehindLastBet({ lines, answerIds: ['a', 'b'], knownLastBetTime: 6000 })
    ).toBe(false)
  })

  it('is not set back by an older copy that arrives after', () => {
    const older = { ...server, latestBetTime: 4000, data: { a: [], b: [] } }
    const { points } = drawn(server, [refreshed, older], live)
    expect(points).toEqual(refreshed.data)
    expect(drawn(server, [older, refreshed], live).points).toEqual(
      refreshed.data
    )
  })

  it('gives a new answer the line there is for it and keeps the others', () => {
    // An answer added since, fetched for, and what came back was an older
    // copy of the history. The new answer still needs fetching again.
    const older = {
      data: { a: [{ x: 1000, y: 0.5 }], c: [{ x: 3000, y: 0.1 }] },
      answerIds: ['a', 'b', 'c'],
      latestBetTime: 4000,
    }
    const { lines, points } = drawn(server, [refreshed, older], {
      ...live,
      c: [{ x: 6000, y: 0.2 }],
    })
    expect(points.a).toEqual(refreshed.data.a)
    expect(points.c).toEqual([
      { x: 3000, y: 0.1 },
      { x: 6000, y: 0.2 },
    ])
    expect(
      getUncoveredAnswerIds({
        neededIds: ['a', 'c'],
        knownIds: ['a', 'b', 'c'],
        lines,
      })
    ).toEqual([])
    expect(
      isBehindLastBet({ lines, answerIds: ['a'], knownLastBetTime: 6000 })
    ).toBe(false)
    expect(
      isBehindLastBet({ lines, answerIds: ['a', 'c'], knownLastBetTime: 6000 })
    ).toBe(true)
  })

  it('catches the first bet of a market rendered before anyone bet', () => {
    const unbet = {
      data: { a: [{ x: 1000, y: 0.5 }] },
      answerIds: ['a'],
      latestBetTime: undefined,
    }
    const { lines } = drawn(unbet, [], {})
    // Nothing is known of a bet: nothing to fetch.
    expect(
      isBehindLastBet({ lines, answerIds: ['a'], knownLastBetTime: undefined })
    ).toBe(false)
    // The page's own feed turns up a bet made before it subscribed.
    expect(
      hasUndeliveredBet({
        lines,
        answerIds: ['a'],
        latestPageBetTime: 5500,
        latestLiveBetTime: undefined,
      })
    ).toBe(true)
    expect(
      isBehindLastBet({ lines, answerIds: ['a'], knownLastBetTime: 5500 })
    ).toBe(true)
  })
})
