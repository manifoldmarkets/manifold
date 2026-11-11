import { Answer } from './answer'
import { MultiContract } from './contract'
import {
  getDefaultGraphedAnswerIds,
  getStepValueAt,
  MAX_DEFAULT_GRAPHED_ANSWERS,
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

describe('getDefaultGraphedAnswerIds, keeping the current lines', () => {
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
