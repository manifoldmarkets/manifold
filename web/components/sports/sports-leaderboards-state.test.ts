import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HOUR_MS, MINUTE_MS } from 'common/util/time'
import {
  boardScopeChildren,
  boardStatus,
  isDelayed,
  shouldRefresh,
} from './sports-leaderboards-state'

const now = Date.UTC(2026, 9, 29, 12)
const built = { updatedTime: now - 12 * MINUTE_MS }
const missing = { updatedTime: null }
const failure = new Error('request failed')

test('nothing shows as failed before the request has an answer', () => {
  // The first render, before the request starts, with or without an error
  // cached from an earlier visit.
  assert.equal(boardStatus(undefined, undefined, false), 'loading')
  assert.equal(boardStatus(undefined, failure, false), 'loading')
  assert.equal(boardStatus(missing, undefined, false), 'loading')
  // In flight: the hook clears the error when a request starts.
  assert.equal(boardStatus(undefined, undefined, true), 'loading')
})

test('a failed request shows as failed, and built boards outlast one', () => {
  assert.equal(boardStatus(undefined, failure, true), 'failed')
  assert.equal(boardStatus(missing, failure, true), 'failed')
  assert.equal(boardStatus(built, failure, true), 'built')
  assert.equal(boardStatus(built, undefined, false), 'built')
})

test('an answer with no boards is told apart from a failure', () => {
  assert.equal(boardStatus(missing, undefined, true), 'notYet')
})

test('a failed request retries at the next check, not on mount', () => {
  const failed = { updatedTime: undefined, error: failure, loading: false }
  assert.equal(shouldRefresh({ ...failed, tick: 0, now }), false)
  assert.equal(shouldRefresh({ ...failed, tick: 1, now }), true)
  assert.equal(shouldRefresh({ ...failed, tick: 7, now }), true)
  // Not while the retry is in flight.
  assert.equal(shouldRefresh({ ...failed, loading: true, tick: 1, now }), false)
})

test('boards refresh when over an hour old or not built yet', () => {
  const ok = { error: undefined, loading: false, tick: 0, now }
  assert.equal(shouldRefresh({ ...ok, updatedTime: null }), true)
  assert.equal(
    shouldRefresh({ ...ok, updatedTime: now - HOUR_MS - MINUTE_MS }),
    true
  )
  assert.equal(shouldRefresh({ ...ok, updatedTime: built.updatedTime }), false)
  assert.equal(shouldRefresh({ ...ok, updatedTime: undefined }), false)
})

test('boards are delayed once a rebuild is overdue', () => {
  assert.equal(isDelayed(now - 59 * MINUTE_MS, now), false)
  assert.equal(isDelayed(now - 90 * MINUTE_MS, now), false)
  assert.equal(isDelayed(now - 91 * MINUTE_MS, now), true)
  assert.equal(isDelayed(now - 5 * HOUR_MS, now), true)
})

// A slice of prod's tree: the NFL with two topics; Soccer, which claims
// Premier League (and its old season) though both sit under it; Basketball,
// which holds the NBA and College Basketball; Football, which holds Soccer and
// the NFL; Sports Betting.
const sport = (key: string, groupIds: string[], slug?: string) => ({
  key,
  label: key.toUpperCase(),
  longLabel: key,
  emoji: '🏅',
  groupIds,
  slug,
})
const topic = (id: string, sportKey: string, groupIds: string[]) => ({
  id,
  slug: id,
  label: id,
  sport: sportKey,
  groupIds: [id, ...groupIds],
  totalMembers: 1,
})
const index = {
  sports: [
    sport('nfl', ['nfl-main'], 'nfl'),
    sport('nba', ['nba-main', 'basketball'], 'nba'),
    sport('ncaab', ['ncaab-main'], 'college-basketball'),
    sport('soccer', ['soccer-main', 'premier-league', 'pl-2024'], 'soccer'),
    // A feed-only sport with no topic: not a board to go to.
    sport('basketball-feed', []),
  ],
  topics: [
    topic('super-bowl', 'nfl', []),
    topic('nfl-draft', 'nfl', []),
    topic('basketball', 'all', ['nba-main', 'ncaab-main']),
    topic('football', 'all', [
      'soccer-main',
      'nfl-main',
      'premier-league',
      'pl-2024',
      'super-bowl',
      'nfl-draft',
    ]),
    topic('premier-league', 'soccer', ['pl-2024']),
    topic('pl-2024', 'soccer', []),
    topic('sports-betting', 'all', []),
  ],
}
const keys = (...args: Parameters<typeof boardScopeChildren>) =>
  boardScopeChildren(...args).map((c) => c.key)
const byId = (id: string) => index.topics.find((t) => t.id === id)

test('All sports lists every sport with a topic, then the topics grouping sports', () => {
  assert.deepEqual(keys('all', undefined, index), [
    'sport-nfl',
    'sport-nba',
    'sport-ncaab',
    'sport-soccer',
    'topic-basketball',
    'topic-football',
    'topic-sports-betting',
  ])
})

test("a sport lists its topics, each opening that topic's leaderboards", () => {
  const nfl = index.sports[0]
  assert.deepEqual(boardScopeChildren(nfl, undefined, index), [
    {
      key: 'topic-super-bowl',
      label: 'super-bowl',
      emoji: undefined,
      href: '/sports/nfl/super-bowl?tab=leaderboards',
    },
    {
      key: 'topic-nfl-draft',
      label: 'nfl-draft',
      emoji: undefined,
      href: '/sports/nfl/nfl-draft?tab=leaderboards',
    },
  ])
  assert.deepEqual(keys(index.sports[3], undefined, index), [
    'topic-premier-league',
    'topic-pl-2024',
  ])
})

test('a topic lists the sports inside it, and its own topics under the same sport', () => {
  assert.deepEqual(keys('all', byId('basketball'), index), [
    'sport-nba',
    'sport-ncaab',
  ])
  // Football's sports, not every topic under them.
  assert.deepEqual(keys('all', byId('football'), index), [
    'sport-nfl',
    'sport-soccer',
  ])
  // Soccer claims Premier League's old season, but sits above it.
  assert.deepEqual(keys(index.sports[3], byId('premier-league'), index), [
    'topic-pl-2024',
  ])
  assert.deepEqual(keys(index.sports[3], byId('pl-2024'), index), [])
  assert.deepEqual(keys('all', byId('sports-betting'), index), [])
})
