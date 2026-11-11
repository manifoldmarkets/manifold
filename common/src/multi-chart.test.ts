import { Answer } from './answer'
import { getAnswerProbability } from './calculate'
import { MultiContract } from './contract'
import {
  addLivePoints,
  addMultiPoints,
  chooseChartPoints,
  FetchedMultiPoints,
  getDefaultGraphedAnswerIds,
  getFittedProbDomain,
  getKnownStepValueAt,
  getStepValueAt,
  getTailToReconcile,
  getUncoveredAnswerIds,
  getWholeHistoryCoverage,
  getZoomWindow,
  latestDefined,
  MAX_DEFAULT_GRAPHED_ANSWERS,
  movedProbability,
  widerHistory,
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

describe('addMultiPoints', () => {
  const lines = {
    a: [
      { x: 10, y: 0.1 },
      { x: 20, y: 0.2 },
    ],
    b: [{ x: 10, y: 0.5 }],
  }

  it('appends new points and leaves the lines it was given alone', () => {
    const result = addMultiPoints(lines, { a: [{ x: 30, y: 0.3 }] })
    expect(result.a).toEqual([
      { x: 10, y: 0.1 },
      { x: 20, y: 0.2 },
      { x: 30, y: 0.3 },
    ])
    expect(lines.a).toHaveLength(2)
  })

  it('keeps the array of a line that gained nothing', () => {
    const result = addMultiPoints(lines, { a: [{ x: 30, y: 0.3 }] })
    expect(result.b).toBe(lines.b)
    expect(result).not.toBe(lines)
  })

  it('returns the same object when there is nothing new', () => {
    expect(addMultiPoints(lines, {})).toBe(lines)
    expect(addMultiPoints(lines, { a: [] })).toBe(lines)
    expect(addMultiPoints(lines, { a: [{ x: 20, y: 0.2 }] })).toBe(lines)
  })

  it('skips points a line already has, and repeats within the additions', () => {
    const result = addMultiPoints(lines, {
      a: [
        { x: 20, y: 0.2 },
        { x: 30, y: 0.3 },
        { x: 30, y: 0.3 },
      ],
    })
    expect(result.a.map((p) => p.x)).toEqual([10, 20, 30])
  })

  it('keeps two different probabilities at one time, in the order given', () => {
    const result = addMultiPoints(lines, {
      a: [
        { x: 30, y: 0.3 },
        { x: 30, y: 0.35 },
      ],
    })
    expect(result.a.slice(2)).toEqual([
      { x: 30, y: 0.3 },
      { x: 30, y: 0.35 },
    ])
  })

  it('puts an earlier point where it belongs', () => {
    const result = addMultiPoints(lines, { a: [{ x: 15, y: 0.15 }] })
    expect(result.a.map((p) => p.x)).toEqual([10, 15, 20])
  })

  it('starts a line for an answer it had none for', () => {
    const result = addMultiPoints(lines, { c: [{ x: 5, y: 0.9 }] })
    expect(result.c).toEqual([{ x: 5, y: 0.9 }])
    expect(Object.keys(result).sort()).toEqual(['a', 'b', 'c'])
  })

  it('gives the same lines however the additions are split up', () => {
    let seed = 3
    const random = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    for (let trial = 0; trial < 50; trial++) {
      const points = Array.from({ length: 40 }, () => ({
        x: Math.floor(random() * 30),
        y: Math.floor(random() * 4) / 4,
      }))
      const allAtOnce = addMultiPoints({}, { a: points })
      let inPieces = {}
      for (let i = 0; i < points.length; i += 7)
        inPieces = addMultiPoints(inPieces, { a: points.slice(i, i + 7) })
      const key = (p: { x: number; y: number }) => `${p.x}:${p.y}`
      // Same set of points, each once, in time order.
      expect(allAtOnce.a.map(key).sort()).toEqual(
        [...new Set(points.map(key))].sort()
      )
      expect((inPieces as typeof allAtOnce).a.map(key).sort()).toEqual(
        allAtOnce.a.map(key).sort()
      )
      for (const line of [allAtOnce.a, (inPieces as typeof allAtOnce).a])
        expect(line.every((p, i) => i === 0 || line[i - 1].x <= p.x)).toBe(true)
    }
  })
})

describe('withLivePoints', () => {
  const data = { a: [{ x: 100, y: 0.4 }] }
  const live = {
    a: [
      { x: 50, y: 0.1 },
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

  it('adds the live points that fall in a stretch that ran up to the last bet', () => {
    const fetched = { ...stretch, reachedLastBet: true }
    expect(withLivePoints(fetched, live)).toEqual({
      a: [
        { x: 100, y: 0.4 },
        { x: 150, y: 0.5 },
      ],
      b: [{ x: 160, y: 0.6 }],
    })
  })

  it('adds nothing to a stretch that ended before the last bet', () => {
    const fetched = { ...stretch, reachedLastBet: false }
    expect(withLivePoints(fetched, live)).toBe(data)
  })

  it('returns the fetched points themselves when nothing live applies', () => {
    const fetched = { ...stretch, reachedLastBet: true }
    expect(withLivePoints(fetched, {})).toBe(data)
    expect(withLivePoints(fetched, { a: [{ x: 50, y: 0.1 }] })).toBe(data)
  })
})

describe('addMultiPoints, on long lines', () => {
  it('finds a repeat anywhere in the part of the line the additions overlap', () => {
    const line = Array.from({ length: 2000 }, (_, i) => ({ x: i, y: i / 2000 }))
    const lines = { a: line }
    // Repeats of points deep in the line, and one new point between them.
    const result = addMultiPoints(lines, {
      a: [
        { x: 500, y: 0.25 },
        { x: 1200, y: 0.6 },
        { x: 800, y: 0.99 },
      ],
    })
    expect(result.a).toHaveLength(2001)
    expect(result.a.filter((p) => p.x === 800)).toEqual([
      { x: 800, y: 0.4 },
      { x: 800, y: 0.99 },
    ])
    expect(addMultiPoints(lines, { a: [{ x: 1999, y: 1999 / 2000 }] })).toBe(
      lines
    )
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
    latestBetTime: undefined,
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

describe('getUncoveredAnswerIds', () => {
  const knownIds = ['a', 'b', 'c', 'd']

  it('is empty when the page was rendered with a line for every answer needed', () => {
    expect(
      getUncoveredAnswerIds({
        neededIds: ['a', 'b'],
        knownIds,
        serverIds: ['a', 'b', 'c'],
        fetchedIds: undefined,
      })
    ).toEqual([])
  })

  it('lists the answers with neither a rendered line nor a place in a fetched history', () => {
    expect(
      getUncoveredAnswerIds({
        neededIds: ['a', 'b', 'c'],
        knownIds,
        serverIds: ['a'],
        fetchedIds: undefined,
      })
    ).toEqual(['b', 'c'])
    expect(
      getUncoveredAnswerIds({
        neededIds: ['a', 'b', 'c'],
        knownIds,
        serverIds: ['a'],
        fetchedIds: ['b'],
      })
    ).toEqual(['c'])
  })

  it('does not take one fetched history as covering answers it was not fetched for', () => {
    // The first fetch went out with the page's shortened answer list. The
    // user then picks an answer from the full list.
    expect(
      getUncoveredAnswerIds({
        neededIds: ['d'],
        knownIds,
        serverIds: [],
        fetchedIds: ['a', 'b', 'c'],
      })
    ).toEqual(['d'])
  })

  it('counts an answer a fetch covered as covered even if nothing came back for it', () => {
    // Otherwise an answer nobody has bet on would be fetched for ever.
    expect(
      getUncoveredAnswerIds({
        neededIds: ['c'],
        knownIds,
        serverIds: [],
        fetchedIds: ['a', 'b', 'c'],
      })
    ).toEqual([])
  })

  it('ignores an answer the market does not have', () => {
    expect(
      getUncoveredAnswerIds({
        neededIds: ['gone'],
        knownIds,
        serverIds: [],
        fetchedIds: undefined,
      })
    ).toEqual([])
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

describe('getTailToReconcile', () => {
  it('is nothing when the chart already holds the last bet the page knows of', () => {
    expect(
      getTailToReconcile({
        completeUntil: 500,
        lastBetTime: 500,
        latestPageBetTime: undefined,
      })
    ).toBeUndefined()
    expect(
      getTailToReconcile({
        completeUntil: 500,
        lastBetTime: 400,
        latestPageBetTime: 500,
      })
    ).toBeUndefined()
  })

  it('runs from the last bet the chart is sure of to the last bet the page knows of', () => {
    // A bet made between the server render and the page subscribing: only
    // the page's own feed knows of it.
    expect(
      getTailToReconcile({
        completeUntil: 500,
        lastBetTime: 500,
        latestPageBetTime: 800,
      })
    ).toEqual({ min: 499, max: 801 })
    // Live bets since the last reconciliation: the contract knows of them.
    expect(
      getTailToReconcile({
        completeUntil: 500,
        lastBetTime: 900,
        latestPageBetTime: 800,
      })
    ).toEqual({ min: 499, max: 901 })
  })

  it('is nothing while there is no complete history to extend', () => {
    expect(
      getTailToReconcile({
        completeUntil: undefined,
        lastBetTime: 900,
        latestPageBetTime: 800,
      })
    ).toBeUndefined()
  })
})

describe('addLivePoints', () => {
  const run = (count: number) =>
    Array.from({ length: count }, (_, i) => ({ x: i, y: (i % 7) / 10 }))

  it('adds points like addMultiPoints while lines are short', () => {
    const live = { a: run(10) }
    const result = addLivePoints(live, { a: [{ x: 10, y: 0.9 }] }, 100)
    expect(result.a).toEqual([...run(10), { x: 10, y: 0.9 }])
    expect(addLivePoints(live, { a: [{ x: 9, y: 0.2 }] }, 100)).toBe(live)
    expect(addLivePoints(live, {}, 100)).toBe(live)
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
    // Still in time order.
    expect(live.a.every((p, i) => i === 0 || live.a[i - 1].x <= p.x)).toBe(true)
    // The thinned part still spans the levels the line reached.
    expect(Math.min(...live.a.map((p) => p.y))).toBe(0)
    expect(Math.max(...live.a.map((p) => p.y))).toBe(0.6)
  })

  it('thins only the lines that grew', () => {
    const quiet = run(150)
    const live = { quiet, busy: run(100) }
    const result = addLivePoints(live, { busy: [{ x: 100, y: 0.5 }] }, 100)
    // `quiet` is over the limit but gained nothing: left as it is.
    expect(result.quiet).toBe(quiet)
    expect(result.busy.length).toBeLessThanOrEqual(100)
  })
})
