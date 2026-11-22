import { readFileSync } from 'fs'
import { join } from 'path'
import { createBdlClient } from '../balldontlie-client'
import { fetchMajorGames, fetchMajorOdds, mapMajorGame } from './major-games'
import { fetchMajorSnapshots } from './major-snapshots'
import { matchesEntrants, reviewedResult } from './major-result'

const source = JSON.parse(
  readFileSync(
    join(__dirname, '../../test/fixtures/bdl/nba/games__recorded-final.json'),
    'utf8'
  )
).data[0] as {
  id: number
  date: string
  datetime: string
  home_team: { id: number; full_name: string }
  visitor_team: { id: number; full_name: string }
}
function feed(reply: (url: URL) => unknown) {
  const urls: URL[] = []
  const client = createBdlClient({
    role: 'recorder',
    key: 'fixture-only',
    transport: async (input) => {
      const url = new URL(input)
      urls.push(url)
      return new Response(
        JSON.stringify({ data: reply(url), meta: { next_cursor: null } }),
        { status: 200 }
      )
    },
  })
  return { client, urls }
}
it.each([
  [
    'missing ID',
    { id: null, full_name: 'Detroit Pistons' },
    { id: null, name: 'Detroit Pistons' },
  ],
  [
    'zero ID',
    { id: 0, full_name: 'Detroit Pistons' },
    { id: null, name: 'Detroit Pistons' },
  ],
  [
    'string ID',
    { id: '9', full_name: 'Detroit Pistons' },
    { id: null, name: 'Detroit Pistons' },
  ],
  ['empty name', { id: 9, full_name: ' ' }, { id: 9, name: null }],
  ['missing team', null, { id: null, name: null }],
])(
  'retains the provider event and withholds unattributable final scores for %s',
  (_, bad, expected) => {
    const game = mapMajorGame('nba', { ...source, home_team: bad })
    expect(game).toMatchObject({
      id: source.id,
      eligible: false,
      status: 'final',
      home: expected,
      away: { id: 2 },
      homeScore: null,
      awayScore: null,
    })
    expect(reviewedResult('nba', game)).toEqual({
      incident: 'unidentifiable entrants',
    })
    expect(
      matchesEntrants({ sportsHomeTeamId: '9', sportsAwayTeamId: '2' }, game)
    ).toBe(false)
  }
)
it('preserves a documented NFL revision when the entrants are incomplete', () => {
  const revised = '2026-11-05T22:12:00Z'
  const game = mapMajorGame('nfl', {
    ...source,
    date: source.datetime,
    updated_at: revised,
    visitor_team: null,
  })
  expect(game).toMatchObject({
    eligible: false,
    scoreUpdatedTime: Date.parse(revised),
    homeScore: null,
  })
})
it('excludes incomplete entrants from odds and standings even when called directly', async () => {
  const held = mapMajorGame('nba', { ...source, visitor_team: { id: 2 } })
  const complete = mapMajorGame('nba', { ...source, id: source.id + 1 })
  const { client, urls } = feed((url) =>
    url.pathname.endsWith('/odds') ? [] : { ...source, visitor_team: { id: 2 } }
  )
  await expect(
    fetchMajorOdds(client, 'nba', [held, complete])
  ).resolves.toEqual(
    new Map([
      [source.id, []],
      [source.id + 1, []],
    ])
  )
  expect(urls[0].searchParams.getAll('game_ids[]')).toEqual([
    String(complete.id),
  ])
  expect(
    (
      await fetchMajorSnapshots(client, 'nba', [{ id: source.id }], {
        standings: true,
      })
    ).get(source.id)
  ).toMatchObject({ eligible: false })
  expect(urls.map((url) => url.pathname)).toEqual([
    '/nba/v2/odds',
    '/nba/v1/games/' + source.id,
  ])
})
it('rejects an unrelated detail ID or conflicting duplicates even if one row lacks a team', async () => {
  const other = { ...source, id: source.id + 1, visitor_team: null }
  const wrong = feed(() => other)
  await expect(
    fetchMajorSnapshots(wrong.client, 'nba', [{ id: source.id }])
  ).rejects.toThrow('different game ID')
  const conflict = feed(() => [{ ...source, visitor_team: null }, source])
  await expect(
    fetchMajorGames(conflict.client, 'nba', source.date, source.date)
  ).rejects.toThrow('Conflicting schedule')
  await expect(
    fetchMajorSnapshots(conflict.client, 'nba', [
      { id: source.id, startTime: source.datetime },
      { id: source.id + 1, startTime: source.datetime },
    ])
  ).rejects.toThrow('duplicate BDL game ID')
})
