import {
  readFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { bdlRecordingPathParts, type BdlParams } from '../balldontlie-request'
import { resolve } from 'node:path'
import {
  golfThrough,
  isOfficialGolfTournament,
  type GolfTournament,
} from 'common/bdl/golf'
import {
  parseGolfTournament,
  projectGolfField,
  readGolfField,
} from './golf-fields'
import { createBdlClient } from '../balldontlie-client'
import { bdlStatsEndpoint } from './request-stats'
// Exercise the normal service transport without opening a service database.
jest.mock('./request-stats', () => ({
  ...jest.requireActual('./request-stats'),
  recordServiceBdlResponse: jest.fn().mockResolvedValue(undefined),
}))

const fixture = (p: string): Record<string, unknown>[] =>
  JSON.parse(
    readFileSync(
      resolve(__dirname, '../../test/fixtures/bdl', p + '.json'),
      'utf8'
    )
  ).data
const pga = fixture('pga/tournaments__stroke-and-exceptions'),
  lpga = fixture('lpga/tournaments__final-and-in-progress'),
  roster = fixture('pga/tournament_competitors__player-identities'),
  entries = fixture('lpga/entries__ties-and-exceptions')
const tournament = (tour: 'pga' | 'lpga', id: number): GolfTournament =>
  parseGolfTournament(
    tour,
    (tour === 'pga' ? pga : lpga).find((x) => x.id === id)
  )!
const time = Date.UTC(2026, 10, 22, 4)
const originalFlag = process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
beforeEach(() => {
  process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = 'true'
})
afterEach(() => {
  if (originalFlag === undefined)
    delete process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED
  else process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = originalFlag
})
const sample = {
  id: 200,
  tournament: { id: 6905 },
  competitor: {
    id: 44387878,
    type: 'PLAYER',
    player: { id: 235, display_name: 'Tiger Woods' },
  },
  position: 'T4',
  position_numeric: 4,
  status: 'T4',
  scoring: { strokes: 39, to_par: -2 },
  thru: '10',
}

it('keeps the suspended RSM round and disputed Bermuda final conservative', () => {
  expect(tournament('pga', 6904)).toMatchObject({
    eventId: 'bdl:pga:6904',
    state: 'suspended',
    round: 3,
  })
  expect(tournament('pga', 6900)).toMatchObject({
    state: 'suspended',
    round: 4,
  })
  expect(tournament('pga', 6903)).toMatchObject({ state: 'final', round: null })
  expect(tournament('lpga', 32)).toMatchObject({
    eventId: 'bdl:lpga:32',
    state: 'live',
    round: 4,
  })
})
it('requires individual format, independently listed ID, season and calendar name', () => {
  const valid = tournament('pga', 6904)
  expect(isOfficialGolfTournament(valid)).toBe(true)
  for (const invalid of [
    tournament('pga', 22),
    tournament('pga', 6905),
    { ...valid, season: 2027 },
    { ...valid, name: 'PGA Tour Champions' },
    { ...valid, id: 77 },
    { ...valid, format: null },
    { ...valid, format: 'MATCH_PLAY' },
    tournament('lpga', 31),
  ])
    expect(isOfficialGolfTournament(invalid)).toBe(false)
})
it('preserves date-only and never manufactures round order or a tee time', () => {
  const raw = pga.find((x) => x.id === 6904)!
  expect(
    parseGolfTournament('pga', {
      ...raw,
      start_date: '2026-02-31',
      rounds: [
        { round_number: 2, status: 'IN_PROGRESS' },
        { round_number: 2, status: 'SUSPENDED' },
      ],
    })
  ).toMatchObject({ state: 'unavailable', round: null, startDate: null })
  expect(tournament('pga', 6904).startDate).toBe('2026-11-19')
  expect(golfThrough('12:32 PM')).toBeNull()
  expect(golfThrough('19')).toBeNull()
  expect(golfThrough('F')).toBe('F')
})
it('retains event-specific competitor ID separately from player identity without inventing standings', () => {
  const field = projectGolfField(tournament('pga', 6905), roster, [], time)
  expect(field.hasResults).toBe(false)
  expect(field.players.find((p) => p.playerId === 235)).toMatchObject({
    competitorId: 44387878,
    name: 'Tiger Woods',
    position: null,
    toPar: null,
    through: null,
  })
})
it('attaches a separately returned standing only to the matching player and event-specific competitor', () => {
  const field = projectGolfField(
    tournament('pga', 6905),
    roster,
    [sample],
    time
  )
  expect(field.incomplete).toBe(false)
  expect(field.players[0]).toMatchObject({
    playerId: 235,
    competitorId: 44387878,
    position: { rank: 4, tied: true },
    toPar: -2,
    through: '10',
  })
  for (const bad of [
    { ...sample, position_numeric: 3 },
    { ...sample, status: 'T11' },
    { ...sample, status: '4' },
    { ...sample, competitor: { ...sample.competitor, id: 123 } },
    {
      ...sample,
      competitor: {
        ...sample.competitor,
        player: { id: 235, display_name: 'Another name' },
      },
    },
  ]) {
    const f = projectGolfField(tournament('pga', 6905), roster, [bad], time)
    expect(f.incomplete).toBe(true)
    expect(f.players.some((p) => p.playerId === 235)).toBe(false)
  }
})
it('holds duplicate rows and mixed tournament rows', () => {
  const mixed = projectGolfField(
    tournament('pga', 6905),
    roster,
    [sample, sample, { ...sample, tournament: { id: 55 } }],
    time
  )
  expect(mixed.incomplete).toBe(true)
  expect(mixed.players.map((p) => p.playerId)).toEqual([236])
})
it('preserves real LPGA T9 ties and omits bogey/hole invention on DQ and unconfirmed entrants', () => {
  const annika = projectGolfField(
    tournament('lpga', 31),
    [],
    entries.filter((x) => x.tournament_id === 31),
    time
  )
  expect(annika.players.find((p) => p.competitorId === 80)).toMatchObject({
    state: 'disqualified',
    toPar: null,
    through: null,
  })
  expect(annika.players.find((p) => p.competitorId === 119)).toMatchObject({
    playerId: 23,
    state: 'unknown',
    position: null,
  })
  expect(annika.players.find((p) => p.competitorId === 144)).toMatchObject({
    fieldPresent: false,
    position: null,
    through: null,
  })
  const ties = projectGolfField(
    tournament('lpga', 29),
    [],
    entries.filter((x) => x.tournament_id === 29),
    time
  )
  expect(
    ties.players.filter((p) => p.position?.rank === 9).length
  ).toBeGreaterThan(1)
  expect(
    ties.players
      .filter((p) => p.position?.rank === 9)
      .every((p) => p.position?.tied)
  ).toBe(true)
})
it('keeps genuine zero separate from missing score or strokes', () => {
  const results = [{ ...sample, scoring: { strokes: 34, to_par: 0 } }]
  expect(
    projectGolfField(tournament('pga', 6905), [], results, time).players[0]
      .toPar
  ).toBe(0)
  for (const [status, position] of [
    ['WDC', 'WDC'],
    ['CUT', 'CUT'],
    ['DQ', 'DQ'],
  ]) {
    const field = projectGolfField(
      tournament('pga', 6905),
      [],
      [
        {
          ...sample,
          status,
          position,
          position_numeric: null,
          scoring: { strokes: null, to_par: 0 },
        },
      ],
      time
    )
    expect(field.players[0].toPar).toBeNull()
  }
})

it('requires consistent status and state for each PGA round', () => {
  const raw = {
    ...pga.find((x) => x.id === 6904),
    status: 'IN_PROGRESS',
    status_state: 'in_progress',
  }
  const parse = (status: string, status_state: string) =>
    parseGolfTournament('pga', {
      ...raw,
      rounds: [{ round_number: 2, status, status_state }],
    })
  expect(parse('IN_PROGRESS', 'in_progress')).toMatchObject({
    state: 'live',
    round: 2,
  })
  for (const [status, state] of [
    ['IN_PROGRESS', 'suspended'],
    ['SUSPENDED', 'in_progress'],
    ['OFFICIAL', 'in_progress'],
    ['NOT_STARTED', 'final'],
  ])
    expect(parse(status, state)).toMatchObject({
      state: 'unavailable',
      round: null,
    })
})

it('holds both players when a PGA result identifier is reused, in either order', () => {
  const next = {
    ...sample,
    competitor: {
      id: 3322,
      type: 'PLAYER',
      player: { id: 17, display_name: 'Second player' },
    },
  }
  for (const pair of [
    [sample, next],
    [next, sample],
  ]) {
    const field = projectGolfField(tournament('pga', 6905), [], pair, time)
    expect(field).toMatchObject({
      hasResults: false,
      incomplete: true,
      players: [],
    })
  }
  expect(
    projectGolfField(
      tournament('pga', 6905),
      [],
      [sample, { ...next, id: 201 }],
      time
    ).players
  ).toHaveLength(2)
})

it.each([
  ['WD', 'withdrawn'],
  ['DQ', 'disqualified'],
])(
  'requires fresh positive evidence after %s disappears from live results',
  (raw, state) => {
    const t = { ...tournament('pga', 6905), state: 'live' as const }
    const player = (result: unknown[]) =>
      projectGolfField(t, roster, result, time).players.find(
        (p) => p.playerId === 235
      )
    expect(
      player([
        { ...sample, status: raw, position: raw, position_numeric: null },
      ])?.state
    ).toBe(state)
    expect(player([])?.state).toBe('unknown')
    expect(player([sample])?.state).toBe('active')
    expect(
      projectGolfField({ ...t, state: 'scheduled' }, roster, [], time)
        .players[0].state
    ).toBe('entered')
  }
)

function transport(pages: unknown[][], after?: () => void) {
  let clock = time
  const get = jest.fn(async (_url: string) => {
    after?.()
    return new Response(
      JSON.stringify({ data: pages.shift(), meta: { next_cursor: null } })
    )
  })
  const client = createBdlClient({
    key: 'synthetic-offline-golf',
    transport: get,
    role: 'api',
    enabledLeagues: new Set(['pga']),
    clock: {
      now: () => clock,
      sleep: async (ms) => {
        clock += ms
      },
    },
  })
  return { client, get }
}
it('reads LPGA from the keyless fixture client without invoking a supplied service transport', async () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'bdl-lpga-replay-')),
    old = process.env
  const add = (path: string, params: BdlParams, data: unknown[]) => {
    const q = { per_page: 100, ...params },
      parts = bdlRecordingPathParts(path, q),
      folder = resolve(dir, parts.league, parts.endpointSlug)
    mkdirSync(folder, { recursive: true })
    writeFileSync(
      resolve(folder, parts.parameterHash + '.json'),
      JSON.stringify({
        request: { path, params: q, at: new Date(time).toISOString() },
        status: 200,
        body: { data, meta: { next_cursor: null } },
      })
    )
  }
  try {
    const supplied = transport([])
    process.env = {
      ...old,
      LOCAL_ONLY: 'true',
      BDL_FIXTURE_DIR: dir,
      SPORTS_FAKE_NOW: new Date(time).toISOString(),
    }
    delete process.env.GOOGLE_CLOUD_PROJECT
    add(
      '/lpga/v1/tournaments',
      { tournament_ids: [31], season: 2026 },
      lpga.filter((t) => t.id === 31)
    )
    add(
      '/lpga/v1/entries',
      { tournament_id: 31 },
      entries.filter((e) => e.tournament_id === 31)
    )
    const data = await readGolfField(
      supplied.client,
      'lpga',
      31,
      2026,
      () => true,
      () => time
    )
    expect(data?.tournament.eventId).toBe('bdl:lpga:31')
    expect(data?.players.find((p) => p.competitorId === 80)?.state).toBe(
      'disqualified'
    )
    expect(supplied.get).not.toHaveBeenCalled()
  } finally {
    process.env = old
    rmSync(dir, { recursive: true, force: true })
  }
})
it('classifies only the three PGA v2 field routes for service accounting', () => {
  for (const resource of [
    'tournaments',
    'tournament_competitors',
    'tournament_results',
  ]) {
    expect(bdlStatsEndpoint('/pga/v2/' + resource)).toEqual({
      league: 'pga',
      template: 'v2/' + resource,
    })
    expect(bdlStatsEndpoint('/pga/v1/' + resource)).toBeUndefined()
    expect(bdlStatsEndpoint('/nba/v1/' + resource)).toBeUndefined()
  }
})
it.each(['LPGA', 'foo', 'PGA', ' pga'])(
  'does not dispatch unsupported runtime tour %s',
  async (value) => {
    const { client, get } = transport([])
    expect(
      await readGolfField(
        client,
        value as GolfTournament['tour'],
        6904,
        2026,
        () => true
      )
    ).toBeNull()
    expect(
      parseGolfTournament(value as GolfTournament['tour'], pga[0])
    ).toBeNull()
    expect(get).not.toHaveBeenCalled()
  }
)

it.each([200, 503])(
  'stops before a further page or retry after phase disable on HTTP %i',
  async (status) => {
    let on = true
    const get = jest.fn(async (url: string) => {
      if (url.includes('/tournament_competitors')) {
        on = false
        return new Response(
          JSON.stringify({ data: [], meta: { next_cursor: 4 } }),
          { status }
        )
      }
      return new Response(
        JSON.stringify({ data: pga.filter((t) => t.id === 6904) })
      )
    })
    let ticks = time
    const client = createBdlClient({
      role: 'api',
      key: 'synthetic-offline-golf',
      enabledLeagues: new Set(['pga']),
      transport: get,
      clock: {
        now: () => ticks,
        sleep: async (ms) => {
          ticks += ms
        },
      },
    })
    expect(await readGolfField(client, 'pga', 6904, 2026, () => on)).toBeNull()
    expect(get).toHaveBeenCalledTimes(2)
  }
)

it('sends zero requests for disabled PGA or held LPGA', async () => {
  const { client, get } = transport([])
  expect(await readGolfField(client, 'pga', 6904, 2026, () => false)).toBeNull()
  expect(await readGolfField(client, 'lpga', 32, 2026, () => true)).toBeNull()
  process.env.NEXT_PUBLIC_SPORTS_BDL_ENABLED = 'false'
  expect(await readGolfField(client, 'pga', 6904, 2026, () => true)).toBeNull()
  expect(get).not.toHaveBeenCalled()
})
it('uses calendar format, exact ID and season with bounded scoped roster and results reads', async () => {
  const raw = pga.find((x) => x.id === 6904)!,
    { client, get } = transport([[raw], [], []])
  const data = await readGolfField(
    client,
    'pga',
    6904,
    2026,
    () => true,
    () => time
  )
  expect(data).toMatchObject({
    tournament: { id: 6904, round: 3 },
    hasResults: false,
    players: [],
    readStartedAt: time,
  })
  expect(get).toHaveBeenCalledTimes(3)
  const requests = get.mock.calls.map(([url]) => new URL(url))
  expect(requests[0].searchParams.get('include_format')).toBe('true')
  expect(
    requests.slice(1).map((url) => url.searchParams.get('tournament_id'))
  ).toEqual(['6904', '6904'])
})
it('rejects an ignored requested tournament without reading another field', async () => {
  const { client, get } = transport([[pga.find((x) => x.id === 22)]])
  await expect(
    readGolfField(client, 'pga', 6904, 2026, () => true)
  ).rejects.toThrow('ignored')
  expect(get).toHaveBeenCalledTimes(1)
})
it('rejects an ignored result filter and suppresses later requests after switch-off', async () => {
  const raw = pga.find((x) => x.id === 6904)!
  const ignored = transport([[raw], [], [sample]])
  await expect(
    readGolfField(ignored.client, 'pga', 6904, 2026, () => true)
  ).rejects.toThrow('ignored')
  let on = true
  const stopped = transport([[raw]], () => {
    on = false
  })
  expect(
    await readGolfField(stopped.client, 'pga', 6904, 2026, () => on)
  ).toBeNull()
  expect(stopped.get).toHaveBeenCalledTimes(1)
})
