import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import {
  blockedTopicFilter,
  ownTopicSlugs,
  shouldLoadPastBlocked,
  shownCount,
  unblockedSchedule,
} from './blocked-topics-state'

// Run: TS_NODE_TRANSPILE_ONLY=1 TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' node -r ts-node/register -r tsconfig-paths/register --test components/sports/blocked-topics-state.test.ts (from web/)

// As on prod: Basketball holds the NBA (and claims nothing); the NBA claims
// Basketball; Soccer claims Premier League, which sits under it; Football
// holds Soccer.
const nba = { slug: 'nba', groupIds: ['nba-id', 'basketball-id'] }
const soccer = { slug: 'soccer', groupIds: ['soccer-id', 'pl-id'] }
const premierLeague = {
  id: 'pl-id',
  slug: 'premiere-league',
  groupIds: ['pl-id'],
}
const topics = [
  {
    id: 'basketball-id',
    slug: 'basketball',
    groupIds: ['basketball-id', 'nba-id'],
  },
  premierLeague,
  {
    id: 'football-id',
    slug: 'football',
    groupIds: ['football-id', 'soccer-id', 'pl-id'],
  },
]

describe('ownTopicSlugs', () => {
  it('is Sports itself on /sports', () => {
    assert.deepEqual(ownTopicSlugs('all', undefined, topics), [
      'sports-default',
      'sports',
    ])
  })

  it('adds the sport and the topics above it on its page', () => {
    assert.deepEqual(ownTopicSlugs(nba, undefined, topics), [
      'sports-default',
      'sports',
      'nba',
      'basketball',
    ])
    // Premier League is under Soccer, so it isn't Soccer's own.
    assert.deepEqual(ownTopicSlugs(soccer, undefined, topics), [
      'sports-default',
      'sports',
      'soccer',
      'football',
    ])
  })

  it("adds the open topic and what's above it on its page", () => {
    assert.deepEqual(ownTopicSlugs(soccer, premierLeague, topics), [
      'sports-default',
      'sports',
      'soccer',
      'premiere-league',
      'football',
    ])
  })

  it('still has the page itself while the topic list loads', () => {
    assert.deepEqual(ownTopicSlugs(soccer, premierLeague, undefined), [
      'sports-default',
      'sports',
      'soccer',
      'premiere-league',
    ])
  })
})

describe('blockedTopicFilter', () => {
  it('keeps everything when nothing is blocked', () => {
    const hides = blockedTopicFilter(undefined, ['sports-default'])
    assert.equal(hides(['nfl']), false)
    assert.equal(hides(undefined), false)
  })

  it('hides a market in any blocked topic', () => {
    const hides = blockedTopicFilter(['nfl', 'super-bowl'], ['sports-default'])
    assert.equal(hides(['sports-default', 'nfl']), true)
    assert.equal(hides(['super-bowl']), true)
    assert.equal(hides(['soccer']), false)
    // A game from an API that doesn't send its topics stays.
    assert.equal(hides(undefined), false)
  })

  it('keeps a blocked topic under the page off it, but not one above', () => {
    const own = ownTopicSlugs(soccer, undefined, topics)
    const hides = blockedTopicFilter(['football', 'premiere-league'], own)
    assert.equal(hides(['soccer', 'football']), false)
    assert.equal(hides(['soccer', 'premiere-league']), true)
    // The NBA's page with Basketball blocked still has the NBA's games.
    const nbaHides = blockedTopicFilter(
      ['basketball'],
      ownTopicSlugs(nba, undefined, topics)
    )
    assert.equal(nbaHides(['nba', 'basketball']), false)
  })

  it('shows a blocked topic on its own page', () => {
    const hides = blockedTopicFilter(
      ['premiere-league'],
      ownTopicSlugs(soccer, premierLeague, topics)
    )
    assert.equal(hides(['soccer', 'premiere-league']), false)
  })

  it('does not empty /sports when Sports itself is blocked', () => {
    const hides = blockedTopicFilter(
      ['sports-default', 'nfl'],
      ownTopicSlugs('all', undefined, topics)
    )
    assert.equal(hides(['sports-default', 'soccer']), false)
    assert.equal(hides(['sports-default', 'nfl']), true)
  })
})

describe('unblockedSchedule', () => {
  const f1 = { slug: 'formula-1', groupIds: ['f1-id'] }
  const mexico = { id: 'mexico-id', slug: 'mexico-gp', groupIds: ['mexico-id'] }
  const weekend = (groupSlugs?: string[]) => ({
    sport: 'f1' as const,
    groupSlugs,
  })
  const sportsByKey = { f1 }

  it("leaves out a weekend by its markets' topics", () => {
    // Blocking a race's topic hides its weekend on the F1 page too.
    const hides = blockedTopicFilter(
      ['mexico-gp'],
      ownTopicSlugs(f1, undefined, [mexico])
    )
    const { weekends } = unblockedSchedule(
      [],
      [weekend(['formula-1', 'mexico-gp']), weekend(['formula-1'])],
      hides,
      sportsByKey
    )
    assert.deepEqual(weekends, [weekend(['formula-1'])])
    // But not on that race's own page.
    const own = blockedTopicFilter(
      ['mexico-gp'],
      ownTopicSlugs(f1, mexico, [mexico])
    )
    assert.equal(
      unblockedSchedule(
        [],
        [weekend(['formula-1', 'mexico-gp'])],
        own,
        sportsByKey
      ).weekends.length,
      1
    )
  })

  it("goes by the sport's topic for a weekend from an older API", () => {
    const hides = blockedTopicFilter(['formula-1'], ['sports-default'])
    assert.deepEqual(
      unblockedSchedule([], [weekend()], hides, sportsByKey).weekends,
      []
    )
  })

  it('leaves out games in a blocked topic', () => {
    const hides = blockedTopicFilter(['nfl'], ['sports-default'])
    const games = [{ groupSlugs: ['nfl'] }, { groupSlugs: ['nba'] }, {}]
    assert.deepEqual(unblockedSchedule(games, [], hides, sportsByKey).games, [
      { groupSlugs: ['nba'] },
      {},
    ])
  })
})

describe('shouldLoadPastBlocked', () => {
  it('loads on while blocks hide everything loaded and there is more', () => {
    const state = { shown: 0, loaded: 20, hasMore: true, stuckAt: undefined }
    assert.equal(shouldLoadPastBlocked(state), true)
    assert.equal(shouldLoadPastBlocked({ ...state, shown: 1 }), false)
    assert.equal(shouldLoadPastBlocked({ ...state, hasMore: false }), false)
    // Nothing loaded yet is the feed's own loading, not the blocks'.
    assert.equal(shouldLoadPastBlocked({ ...state, loaded: 0 }), false)
  })

  it('stops after a failed load until more arrives', () => {
    const state = { shown: 0, loaded: 20, hasMore: true, stuckAt: 20 }
    assert.equal(shouldLoadPastBlocked(state), false)
    assert.equal(shouldLoadPastBlocked({ ...state, loaded: 40 }), true)
  })
})

describe('shownCount', () => {
  it('counts the games and weekends still on, as the feed shows them', () => {
    assert.equal(
      shownCount(
        [{ status: 'upcoming' }, { status: 'live' }, { status: 'finished' }],
        [{ status: 'upcoming' }, { status: 'finished' }]
      ),
      3
    )
    // A live update that finishes the only game leaves nothing shown.
    assert.equal(shownCount([{ status: 'finished' }], []), 0)
  })
})
