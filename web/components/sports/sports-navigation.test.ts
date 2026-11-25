import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BDL_LEAGUE_KEYS, BDL_LEAGUES } from 'common/bdl/leagues'
import { sportsFamilies, sportsFamily } from 'common/sports-navigation-family'
import { SportInfo } from 'common/sports-schedule'
import {
  hasSportsResult,
  leagueRailChoices,
  matchesGameLeague,
  sportsLeague,
  sportsView,
  sportsViewHref,
  SPORTS_VIEWS,
} from './sports-navigation'

test('every view and league round-trips through a shareable sports URL', () => {
  assert.deepEqual(
    SPORTS_VIEWS.map(([, title]) => title),
    ['Schedule', 'Live', 'Results', 'All markets', 'My picks']
  )
  for (const league of BDL_LEAGUE_KEYS) {
    const family = sportsFamily(BDL_LEAGUES[league].sportKey, league)
    for (const [view] of SPORTS_VIEWS) {
      const url = new URL(
        sportsViewHref(family, view, league),
        'http://localhost'
      )
      assert.equal(url.pathname, '/sports/' + family)
      assert.equal(
        sportsLeague(url.searchParams.get('league') ?? undefined),
        league
      )
      assert.equal(sportsView(url.searchParams.get('tab') ?? undefined), view)
    }
  }
  assert.equal(sportsViewHref('all', 'schedule'), '/sports')
  assert.equal(
    sportsViewHref('soccer', 'results', 'fifa/worldcup'),
    '/sports/soccer?tab=results&league=fifa%2Fworldcup'
  )
  assert.equal(sportsViewHref('nba', 'picks'), '/sports/nba?tab=picks')
})

test('changing tabs preserves invalid league links until All leagues is chosen', () => {
  for (const invalid of ['other-league', '', ['nba', 'wnba']]) {
    for (const [view] of SPORTS_VIEWS) {
      const href = sportsViewHref('basketball', view, invalid)
      const values = new URL(href, 'http://localhost').searchParams.getAll(
        'league'
      )
      assert.deepEqual(values, Array.isArray(invalid) ? invalid : [invalid])
      assert.equal(sportsLeague(values.length === 1 ? values[0] : values), null)
    }
  }
  assert.equal(
    sportsViewHref('basketball', 'live', 'all'),
    '/sports/basketball?tab=live'
  )
})

test('a selected empty league stays in its family rail', () => {
  assert.deepEqual(leagueRailChoices('basketball', ['nba'], 'wnba'), [
    'nba',
    'wnba',
  ])
  assert.deepEqual(leagueRailChoices('basketball', ['nba'], 'nba'), ['nba'])
  assert.deepEqual(leagueRailChoices('all', [], 'f1'), ['f1'])
  assert.deepEqual(leagueRailChoices('soccer', ['epl'], 'wnba'), ['epl'])
  assert.deepEqual(leagueRailChoices('soccer', ['epl'], null), ['epl'])
})

test('legacy games, tools and live links remain usable', () => {
  for (const old of ['games', 'upcoming', undefined])
    assert.equal(sportsView(old), 'schedule')
  assert.equal(sportsView(undefined, 'live'), 'live')
  assert.equal(sportsView('picks', 'live'), 'picks')
  assert.equal(sportsView('leaderboards'), 'leaderboards')
  assert.equal(sportsView('topic'), 'topic')
})

test('family rails merge only related native sports, without changing source topic IDs', () => {
  const row = (key: string, groupIds: string[]): SportInfo => ({
    key,
    label: key,
    longLabel: key,
    emoji: '',
    groupIds,
  })
  const native = [
    row('nba', ['a', 'b']),
    row('wnba', ['c']),
    row('basketball', ['b']),
    row('nfl', ['d']),
    row('soccer', ['e']),
    row('college-baseball', ['f']),
    row('cycling', ['g']),
  ]
  const families = sportsFamilies(native)
  assert.deepEqual(
    families.map((f) => f.key),
    ['basketball', 'football', 'soccer', 'baseball', 'cycling']
  )
  assert.deepEqual(families[0].groupIds, ['a', 'b', 'c'])
  assert.deepEqual(native[0].groupIds, ['a', 'b'])
  assert.equal(sportsFamily('other', 'cbb'), 'baseball')
  assert.equal(sportsFamily('other'), 'other')
})

test('a missing old-worker league, invalid league or conflicting projection never broadens a league view', () => {
  const game = { navigationLeagueKey: 'wnba', sportsLeagueKey: 'nba' } as const
  assert.equal(matchesGameLeague(game, 'wnba'), true)
  assert.equal(matchesGameLeague(game, 'nba'), false)
  assert.equal(matchesGameLeague({}, 'wnba'), false)
  for (const invalid of ['unknown', ['nba', 'wnba']])
    assert.equal(matchesGameLeague(game, sportsLeague(invalid)), false)
  assert.equal(matchesGameLeague({}, sportsLeague(undefined)), true)
})

test('results require actual provider final or native settlement', () => {
  assert.equal(hasSportsResult({ isResolved: false }), false)
  assert.equal(
    hasSportsResult({ isResolved: false, reportedFinal: true }),
    true
  )
  assert.equal(hasSportsResult({ isResolved: true }), true)
  assert.equal(hasSportsResult({ isResolved: true, isCanceled: true }), false)
})
