import { Contract } from './contract'
import {
  getNextMarketPromptPlacement,
  isNextMarketPromptLocation,
  pickNextMarketCandidates,
  NextMarketPromptQueue,
  updateNextMarketPromptQueue,
} from './next-market-prompt'

const NOW = 1_800_000_000_000

const binary = (id: string, overrides: Record<string, unknown> = {}) =>
  ({
    id,
    outcomeType: 'BINARY',
    mechanism: 'cpmm-1',
    prob: 0.5,
    token: 'MANA',
    visibility: 'public',
    isResolved: false,
    closeTime: NOW + 1_000_000,
    ...overrides,
  } as unknown as Contract)

const multi = (id: string, overrides: Record<string, unknown> = {}) =>
  ({
    id,
    outcomeType: 'MULTIPLE_CHOICE',
    mechanism: 'cpmm-multi-1',
    token: 'MANA',
    visibility: 'public',
    isResolved: false,
    ...overrides,
  } as unknown as Contract)

const pick = (
  candidates: Contract[],
  opts: Partial<Parameters<typeof pickNextMarketCandidates>[1]> = {}
) =>
  pickNextMarketCandidates(candidates, {
    sourceContractId: 'source',
    token: 'MANA',
    excludeContractIds: new Set(),
    now: NOW,
    ...opts,
  }).map((c) => c.id)

describe('pickNextMarketCandidates', () => {
  it('starts with one suggestion and retains ranked order for a larger pool', () => {
    const candidates = [binary('a'), multi('b'), binary('c'), binary('d')]
    expect(pick(candidates)).toEqual(['a'])
    expect(pick(candidates, { count: 3 })).toEqual(['a', 'b', 'c'])
    expect(pick(candidates, { count: 0 })).toEqual([])
  })

  it('skips the market just bet on and duplicates', () => {
    expect(pick([binary('source'), binary('a'), binary('a')])).toEqual(['a'])
  })

  it('skips markets the user has already bet on', () => {
    expect(
      pick([binary('held'), binary('a')], {
        excludeContractIds: new Set(['held']),
      })
    ).toEqual(['a'])
  })

  it('skips resolved, closed, deleted and non-public markets', () => {
    expect(
      pick([
        binary('resolved', { isResolved: true }),
        binary('closed', { closeTime: NOW - 1 }),
        binary('deleted', { deleted: true }),
        binary('unlisted', { visibility: 'unlisted' }),
        binary('open', { closeTime: undefined }),
      ])
    ).toEqual(['open'])
  })

  it('skips binary markets at or beyond 5% and 95%', () => {
    expect(
      pick(
        [
          binary('low', { prob: 0.04 }),
          binary('high', { prob: 0.96 }),
          binary('edge-low', { prob: 0.05 }),
          binary('edge-high', { prob: 0.95 }),
        ],
        { count: 3 }
      )
    ).toEqual(['edge-low', 'edge-high'])
  })

  it('skips markets without a row bet button and other tokens', () => {
    expect(
      pick([
        binary('cash', { token: 'CASH' }),
        binary('perp', { outcomeType: 'PERP', mechanism: 'perp' }),
        binary('poll', { outcomeType: 'POLL', mechanism: 'none' }),
        binary('stonk', { outcomeType: 'STONK' }),
        multi('ok'),
      ])
    ).toEqual(['ok'])
  })

  it('applies the caller block check', () => {
    expect(
      pick([binary('blocked'), binary('a')], {
        isBlocked: (c) => c.id === 'blocked',
      })
    ).toEqual(['a'])
  })

  it('matches the cash token when the bet was in cash', () => {
    expect(
      pick([binary('mana'), binary('cash', { token: 'CASH' })], {
        token: 'CASH',
      })
    ).toEqual(['cash'])
  })

  it('applies topic blocks after hydration and fills from later candidates', () => {
    const candidates = ['blocked', 'a', 'b', 'c'].map((id) =>
      binary(id, { groupSlugs: [] })
    )
    expect(
      pick(candidates, {
        hydratedContracts: [
          binary('c'),
          binary('blocked', { groupSlugs: ['blocked-topic'] }),
          binary('b'),
          binary('a'),
        ],
        isBlocked: (c) => c.groupSlugs?.includes('blocked-topic') ?? false,
        count: 3,
      })
    ).toEqual(['a', 'b', 'c'])
  })

  it('uses hydrated eligibility instead of a stale related-market snapshot', () => {
    expect(
      pick(
        [binary('closed'), binary('resolved'), binary('extreme'), binary('a')],
        {
          hydratedContracts: [
            binary('closed', { closeTime: NOW - 1 }),
            binary('resolved', { isResolved: true }),
            binary('extreme', { prob: 0.99 }),
            binary('a'),
          ],
        }
      )
    ).toEqual(['a'])
  })

  it('excludes missing hydrated contracts instead of using stripped data', () => {
    expect(
      pick([binary('missing'), binary('a')], {
        hydratedContracts: [binary('a')],
      })
    ).toEqual(['a'])
    expect(pick([binary('a')], { hydratedContracts: [] })).toEqual([])
  })

  it('requires hydrated answers before offering a multiple-choice dialog', () => {
    expect(
      pick([multi('empty'), multi('a')], {
        hydratedContracts: [
          multi('empty', { answers: [] }),
          multi('a', {
            answers: [{ id: 'answer', text: 'Answer', prob: 0.5 }],
          }),
        ],
      })
    ).toEqual(['a'])
  })

  it('offers hydrated multiple-choice markets from both CPMM versions', () => {
    const answers = [{ id: 'answer', text: 'Answer', prob: 0.5 }]
    expect(
      pick([multi('v1'), multi('v2', { mechanism: 'cpmm-multi-2' })], {
        hydratedContracts: [
          multi('v1', { answers }),
          multi('v2', { mechanism: 'cpmm-multi-2', answers }),
        ],
        count: 3,
      })
    ).toEqual(['v1', 'v2'])
  })
})

describe('updateNextMarketPromptQueue', () => {
  const empty = (): NextMarketPromptQueue => ({
    shown: [],
    remaining: [],
    completedIds: [],
  })
  const options = {
    sourceContractId: 'source',
    token: 'MANA' as const,
    excludeContractIds: new Set<string>(),
    now: NOW,
  }
  const update = (
    queue: NextMarketPromptQueue,
    ids: string[],
    completedId?: string
  ) =>
    updateNextMarketPromptQueue(
      queue,
      ids.map((id) => binary(id)),
      options,
      completedId
    )
  const shown = (queue: NextMarketPromptQueue) => queue.shown.map((c) => c.id)

  it('keeps reserves hidden until a trade and appends just one each time', () => {
    let queue = update(empty(), ['a', 'b', 'c'])
    expect(shown(queue)).toEqual(['a'])
    queue = update(queue, ['d']) // Bet intent prefetch, not a completed trade.
    expect(shown(queue)).toEqual(['a'])
    queue = update(queue, [], 'a')
    expect(shown(queue)).toEqual(['a', 'b'])
    expect(shown(update(queue, [], 'b'))).toEqual(['a', 'b', 'c'])
  })

  it('replenishes a single-result pool even when prefetch finishes after the trade', () => {
    let queue = update(empty(), ['a'])
    queue = update(queue, [], 'a')
    expect(shown(queue)).toEqual(['a'])
    queue = update(queue, ['source', 'a', 'b', 'b', 'c'])
    expect(shown(queue)).toEqual(['a', 'b'])
    expect(queue.remaining.map((c) => c.id)).toEqual(['c'])
  })

  it('does not refill twice for repeated completion callbacks or unseen markets', () => {
    let queue = update(empty(), ['a', 'b', 'c'])
    queue = update(queue, [], 'a')
    queue = update(queue, [], 'a')
    queue = update(queue, [], 'not-shown')
    expect(shown(queue)).toEqual(['a', 'b'])
    expect(queue.completedIds).toEqual(['a'])
  })

  it('deduplicates overlapping responses and never reoffers a completed pick', () => {
    let queue = update(empty(), ['a', 'b'])
    queue = update(queue, ['b', 'c', 'c'])
    queue = update(queue, ['a', 'c', 'd'], 'a')
    queue = update(queue, ['a', 'b'], 'b')
    expect(shown(queue)).toEqual(['a', 'b', 'c'])
    expect(queue.remaining.map((c) => c.id)).toEqual(['d'])
  })

  it('rechecks closed, blocked and recently traded reserves before revealing', () => {
    const queue = updateNextMarketPromptQueue(
      empty(),
      [
        binary('a'),
        binary('closed', { closeTime: NOW + 1 }),
        binary('blocked'),
        binary('recent'),
        binary('next'),
      ],
      options
    )
    const next = updateNextMarketPromptQueue(
      queue,
      [],
      {
        ...options,
        now: NOW + 2,
        excludeContractIds: new Set(['recent']),
        isBlocked: (c) => c.id === 'blocked',
      },
      'a'
    )
    expect(shown(next)).toEqual(['a', 'next'])
  })

  it('stops quietly when no further eligible candidate exists', () => {
    const queue = update(update(empty(), ['a']), [], 'a')
    expect(shown(update(queue, ['source', 'a']))).toEqual(['a'])
    expect(queue.remaining).toEqual([])
  })
})

describe('isNextMarketPromptLocation', () => {
  it('triggers only for market-page bet panels', () => {
    expect(isNextMarketPromptLocation('bet panel')).toBe(true)
    expect(isNextMarketPromptLocation('contract page answer')).toBe(true)
    expect(isNextMarketPromptLocation('contract table')).toBe(false)
    expect(isNextMarketPromptLocation('feed card')).toBe(false)
    expect(isNextMarketPromptLocation('next market prompt')).toBe(false)
    expect(isNextMarketPromptLocation(undefined)).toBe(false)
  })
})

describe('getNextMarketPromptPlacement', () => {
  it('keeps the binary panel strip inside the panel and answer bets on the page', () => {
    expect(getNextMarketPromptPlacement('bet panel')).toBe('panel')
    expect(getNextMarketPromptPlacement('contract page answer')).toBe('page')
  })
})
