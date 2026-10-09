import { Contract } from './contract'
import {
  isNextMarketPromptLocation,
  pickNextMarketCandidates,
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
  it('keeps the supplied order and caps at three', () => {
    expect(pick([binary('a'), multi('b'), binary('c'), binary('d')])).toEqual([
      'a',
      'b',
      'c',
    ])
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
      pick([
        binary('low', { prob: 0.04 }),
        binary('high', { prob: 0.96 }),
        binary('edge-low', { prob: 0.05 }),
        binary('edge-high', { prob: 0.95 }),
      ])
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
