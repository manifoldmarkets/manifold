import { LeaguePlan } from '../../scripts/bdl-recorder/spec'
import { bdlUrl } from './balldontlie-request'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  buildPlan,
  buildWatchPlan,
  History,
} from '../../scripts/bdl-recorder/plan'
import { probeMatchesLeague } from '../../scripts/bdl-recorder/probes'

let folder: string
const now = new Date('2026-11-20T12:00:00Z')
beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'bdl-plan-'))
})
afterEach(() => rmSync(folder, { recursive: true }))

function spec(file: string, base: string, routes: Record<string, string[]>) {
  const paths = Object.fromEntries(
    Object.entries(routes).map(([name, params]) => [
      name,
      {
        get: {
          parameters: params.map((param) => {
            const name = param.replace(/!$/, '')
            const multiple = name.endsWith('[]')
            return {
              in: 'query',
              name,
              required: param.endsWith('!'),
              schema: { type: multiple ? 'array' : 'integer' },
            }
          }),
        },
      },
    ])
  )
  writeFileSync(
    join(folder, file + '.yml'),
    JSON.stringify({
      openapi: '3.1.0',
      servers: [{ url: 'https://api.balldontlie.io' + base }],
      paths,
    })
  )
}

it('plans both seasons plus one past and upcoming sample for each odds endpoint', () => {
  spec('nba', '', {
    '/nba/v1/games': ['seasons[]', 'cursor', 'per_page'],
    '/nba/v2/odds': ['game_ids[]'],
    '/nba/v2/odds/opening': ['game_ids[]'],
  })
  const plan = buildPlan({ specDir: folder, leagues: ['nba'], now })
  expect(plan).toHaveLength(7)
  expect(
    plan.slice(0, 2).map((s) => [s.preview.params['seasons[]'], s.paginate])
  ).toEqual([
    [[2025], true],
    [[2026], true],
  ])
  const history: History = new Map([
    [
      plan[1].label,
      [
        {
          data: [
            { id: 2, date: '2026-11-19' },
            { id: 7, date: '2026-12-20' },
            { id: 1, date: 'invalid' },
          ],
        },
        {
          data: [
            { id: 3, date: '2026-11-18' },
            { id: 9, date: '2026-11-21' },
            { id: 2, date: '2026-11-19' },
          ],
        },
      ],
    ],
  ])
  expect(plan[3].resolve(history)[0].params).toEqual({ 'game_ids[]': [2, 3] })
  expect(plan[4].resolve(history)[0].params).toEqual({ 'game_ids[]': [9, 7] })
  expect(plan[3].resolve(new Map())).toEqual([])
  expect(plan[2].resolve(history)).toEqual([])
  expect(plan[2].resolve(new Map())[0].params['seasons[]']).toEqual([2027])
})

it('resolves relative OpenAPI paths and preserves a free sample with no cursor fanout', () => {
  spec('mma', '/mma/v1', {
    '/events': ['year', 'per_page', 'cursor'],
    '/leagues': [],
  })
  const plan = buildPlan({
    specDir: folder,
    leagues: ['mma'],
    freeTier: true,
    now,
  })
  expect(plan.map((s) => s.preview.path)).toEqual([
    '/mma/v1/leagues',
    '/mma/v1/events',
  ])
  expect(plan[1].resolve(new Map())[0].params).toEqual({
    year: 2026,
    per_page: 1,
  })
  expect(plan.every((s) => !s.paginate)).toBe(true)
})

it('follows a recorded card ID only for UFC fights and watches all pages of the selected card', () => {
  spec('mma', '/mma/v1', {
    '/events': ['year', 'per_page', 'cursor'],
    '/events/{id}': [],
    '/fights': ['event_ids[]', 'cursor', 'per_page'],
  })
  const plan = buildPlan({ specDir: folder, leagues: ['mma'], now })
  expect(
    plan[2].resolve(
      new Map([
        [
          plan[1].label,
          [
            {
              data: [
                { id: 73, league: { name: 'Ultimate Fighting Championship' } },
                { id: 81, league: { name: 'Another league' } },
              ],
            },
          ],
        ],
      ])
    )[0].params['event_ids[]']
  ).toEqual([73])
  const watch = buildWatchPlan({
    specDir: folder,
    league: 'mma',
    id: '73',
    now,
  })
  expect(watch[0].preview.path).toBe('/mma/v1/events/73')
  expect(watch[1].preview.params['event_ids[]']).toEqual(['73'])
  expect(watch[1].paginate).toBe(true)
})

it('filters shared soccer match pages to the requested event', () => {
  spec('epl', '', {
    '/epl/v2/matches': ['dates[]', 'cursor', 'per_page'],
    '/epl/v2/match_events': ['match_ids[]', 'cursor', 'per_page'],
  })
  const watch = buildWatchPlan({
    specDir: folder,
    league: 'epl',
    id: '12',
    now,
  })
  expect(watch[0].select?.({ data: [{ id: 5 }, { id: 12 }] })).toEqual([
    { id: 12 },
  ])
  expect(watch[1].preview.params['match_ids[]']).toEqual(['12'])
})

it('supports explicit disambiguation of the two P-F1 probes', () => {
  expect(probeMatchesLeague('P-F1', 'f1')).toBe(true)
  expect(probeMatchesLeague('P-F1', 'ncaaf')).toBe(true)
  expect(probeMatchesLeague('f1:P-F1', 'ncaaf')).toBe(false)
  expect(probeMatchesLeague('ncaaf:P-F1', 'ncaaf')).toBe(true)
})

it('samples scheduled and final tennis match IDs separately within one active draw', () => {
  spec('atp', '/atp/v1', {
    '/matches': ['season', 'cursor'],
    '/tournaments': ['season', 'cursor'],
    '/odds': ['match_ids[]', 'tournament_ids[]'],
  })
  const plan = buildPlan({ specDir: folder, leagues: ['atp'], now })
  const tournament = { id: 8, start_date: '2026-11-18', end_date: '2026-11-25' }
  const h: History = new Map([
    [
      'atp schedule 2026',
      [
        {
          data: [
            { id: 1, tournament, status_state: 'final' },
            { id: 2, tournament, status_state: 'scheduled' },
          ],
        },
      ],
    ],
  ])
  expect(
    plan.find((s) => s.label === 'atp past odds')?.resolve(h)[0].params[
      'match_ids[]'
    ]
  ).toEqual([1])
  expect(
    plan.find((s) => s.label === 'atp upcoming odds')?.resolve(h)[0].params[
      'match_ids[]'
    ]
  ).toEqual([2])
})

it('treats rejection of an experimental ranking week as evidence only for that call', () => {
  spec('ncaaf', '/ncaaf/v1', { '/rankings': ['season', 'week'] })
  const steps = buildPlan({
    specDir: folder,
    leagues: ['ncaaf'],
    now,
    probe: 'P-F4',
  })
  expect(steps.map((s) => s.rejectedStatuses)).toEqual([
    undefined,
    [400, 404, 422],
  ])
})

it('records negative bracket-ID evidence only for the game lookup', () => {
  spec('ncaab', '/ncaab/v1', {
    '/bracket': ['season', 'cursor'],
    '/games/{id}': [],
  })
  const [bracket, game] = buildPlan({
    specDir: folder,
    leagues: ['ncaab'],
    now,
    probe: 'P-B1',
  })
  expect(bracket.rejectedStatuses).toBeUndefined()
  expect(game.rejectedStatuses).toEqual([404])
  expect(
    game.resolve(
      new Map([
        [bracket.label, [{ data: [{ game_id: null }, { game_id: 81 }] }]],
      ])
    )[0].path
  ).toBe('/ncaab/v1/games/81')
})

it.each([false, true])(
  'captures full regular-season NHL shootout play evidence with cursor support %s',
  (cursor) => {
    spec('nhl', '/nhl/v1', {
      '/games': ['seasons[]', 'cursor'],
      '/odds': ['game_ids[]'],
      '/odds/opening': ['game_ids[]'],
      '/plays': ['game_id', ...(cursor ? ['cursor'] : [])],
    })
    const plan = buildPlan({
      specDir: folder,
      leagues: ['nhl'],
      now,
      probe: 'P-US',
    })
    const plays = plan.find((s) => s.preview.path === '/nhl/v1/plays')!
    const h: History = new Map([
      [
        plan[0].label,
        [
          {
            data: [
              { id: 1, period: 5, postseason: true },
              { id: 2, period: 4, postseason: false },
            ],
          },
          { data: [{ id: 3, period: 5, postseason: false }] },
        ],
      ],
    ])
    expect(plays.resolve(h)).toEqual([
      { league: 'nhl', path: '/nhl/v1/plays', params: { game_id: 3 } },
    ])
    expect(plays.paginate).toBe(cursor)
  }
)

it('declares exactly the prior same-league responses read by each resolver', () => {
  spec('nba', '/nba/v1', {
    '/games': ['seasons[]', 'cursor'],
    '/odds': ['game_ids[]'],
  })
  spec('dota', '/dota/v1', {
    '/tournaments': ['cursor'],
    '/matches': ['tournament_id', 'cursor'],
    '/tournament_teams': ['tournament_id!'],
    '/tournament_roster': ['tournament_id!', 'team_id!'],
  })
  const plan = buildPlan({ specDir: folder, leagues: ['nba', 'dota'], now })
  const producers = new Map<string, string>()
  for (const step of plan) {
    const history: History = new Map()
    const reads = jest.spyOn(history, 'get')
    step.resolve(history)
    const actual = [...new Set(reads.mock.calls.map(([label]) => label))]
    expect(step.dependsOn).toEqual(actual.length ? actual : undefined)
    for (const label of actual)
      expect(producers.get(label)).toBe(step.preview.league)
    producers.set(step.label, step.preview.league)
  }
  expect(
    plan.find(
      (s) => s.label === 'nba next-season lookahead if no upcoming event'
    )?.dependsOn
  ).toEqual(['nba schedule 2025', 'nba schedule 2026'])
  expect(
    plan.find((s) => s.label === 'dota reference tournament_roster')?.dependsOn
  ).toEqual(['dota tournament directory', 'dota sample tournament teams'])
})

it('keeps the singular spelling on the wire when probing a documented array filter', () => {
  spec('lol', '/lol/v1', { '/matches': ['dates[]'] })
  const plan = new LeaguePlan('lol', folder, now)
  const singular = plan.request(
    'matches',
    { dates: '2026-11-20' },
    undefined,
    true
  )
  const plural = plan.request('matches', { dates: '2026-11-20' })
  expect(bdlUrl(singular.path, singular.params).searchParams.has('dates')).toBe(
    true
  )
  expect(bdlUrl(plural.path, plural.params).searchParams.has('dates[]')).toBe(
    true
  )
})
