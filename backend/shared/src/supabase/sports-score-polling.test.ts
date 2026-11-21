import { PGlite } from '@electric-sql/pglite'
import * as pgPromise from 'pg-promise'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import {
  getScorePollingGames,
  getScorePollingSettings,
  setScorePolling,
} from './sports-score-polling'

jest.mock('./init', () => ({ pgp: jest.requireActual('pg-promise')() }))
jest.setTimeout(30_000)

it('lists official BDL and Odds games independently and round-trips league controls', async () => {
  const db = new PGlite()
  const pgp = pgPromise()
  const rows = async (q: string, args: unknown[] = []) =>
    (await db.query(pgp.as.format(q, args))).rows
  const pg = {
    manyOrNone: rows,
    map: async (q: string, args: unknown[], map: (row: unknown) => unknown) =>
      (await rows(q, args)).map(map),
    none: rows,
  } as unknown as Parameters<typeof getScorePollingSettings>[0]
  try {
    await db.exec(`create table contracts(id text, creator_id text, token text, visibility text, deleted boolean,
      resolution text, close_time timestamptz, data jsonb);
      create table sports_score_polling(target text primary key,interval_seconds integer not null,updated_by text not null,
      updated_time timestamptz not null default now());`)
    const now = Date.now()
    const iso = (ms: number) => new Date(now + ms).toISOString()
    const base = {
      sportsEventId: 'bdl:nba:42',
      sportsMarketType: 'moneyline',
      sportsLeague: 'NBA',
      sportsLeagueKey: 'nba',
      sportsStartKnown: true,
      sportsStartTimestamp: iso(-60000),
    }
    const create = (
      id: string,
      patch: Record<string, unknown> = {},
      change: {
        creator?: string
        token?: string
        visibility?: string
        deleted?: boolean
        resolution?: string
        close?: string
      } = {}
    ) =>
      rows('insert into contracts values($1,$2,$3,$4,$5,$6,$7,$8::jsonb)', [
        id,
        change.creator ?? MANIFOLD_SPORTS_USER_IDS[0],
        change.token ?? 'MANA',
        change.visibility ?? 'public',
        change.deleted ?? false,
        change.resolution ?? null,
        change.close ?? iso(3600000),
        JSON.stringify({ ...base, question: id, slug: id, ...patch }),
      ])
    await create('bdl')
    await create('worldcup', {
      sportsEventId: 'bdl:fifa/worldcup:7',
      sportsLeagueKey: 'fifa/worldcup',
    })
    await create('odds', {
      sportsEventId: 'odds:football:10',
      sportsLeagueKey: undefined,
    })
    await create('stampedOdds', {
      sportsEventId: 'provider-native',
      sportsProvider: 'odds',
    })
    const excluded: Record<string, unknown>[] = [
      { sportsProvider: 'fixture' },
      { sportsFixture: true },
      { sportsEventId: 'fixture:nba:8', sportsProvider: 'odds' },
      { sportsEventId: 'bdl-f1:4:5' },
      { sportsEventId: 'bdl:nba:0' },
      { sportsLeagueKey: 'nhl' },
      { sportsMarketType: 'player-prop' },
      { sportsStartKnown: false },
      { sportsStartTimestamp: 'not-a-date' },
      { sportsStartTimestamp: '2026-02-30T00:00:00Z' },
      { sportsStartTimestamp: iso(13 * 3600000) },
    ]
    for (const [i, patch] of excluded.entries()) await create('bad' + i, patch)
    for (const [i, columns] of [
      { creator: 'user' },
      { token: 'CASH' },
      { visibility: 'unlisted' },
      { deleted: true },
      { resolution: 'CANCEL' },
      { close: iso(-7 * 3600000) },
      { close: iso(17 * 3600000) },
    ].entries())
      await create('hidden' + i, {}, columns)
    const games = await getScorePollingGames(pg)
    expect(games.map((g) => g.contractId)).toEqual([
      'bdl',
      'odds',
      'stampedOdds',
      'worldcup',
    ])
    expect(games.find((g) => g.contractId === 'bdl')).toMatchObject({
      leagueKey: 'nba',
      startTime: Date.parse(base.sportsStartTimestamp),
    })
    expect(games.find((g) => g.contractId === 'worldcup')?.leagueKey).toBe(
      'fifa/worldcup'
    )
    expect(
      games.find((g) => g.contractId === 'odds')?.leagueKey
    ).toBeUndefined()
    await rows(`insert into contracts select 'batch'||i, c.creator_id,c.token,c.visibility,false,null,c.close_time,
      c.data || jsonb_build_object('sportsEventId','bdl:nba:'||(100+i)) from contracts c,generate_series(1,115) i where c.id='bdl'`)
    const busy = await getScorePollingGames(pg)
    expect(busy.filter((g) => g.leagueKey)).toHaveLength(100)
    expect(busy.filter((g) => !g.leagueKey)).toHaveLength(2)
    const id = 'league:nba'
    for (const intervalSeconds of [120, 0, null]) {
      await setScorePolling(pg, {
        target: id,
        intervalSeconds,
        userId: 'operator',
      })
      expect((await getScorePollingSettings(pg)).leagues?.nba).toBe(
        intervalSeconds ?? undefined
      )
    }
  } finally {
    await db.close()
    pgp.end()
  }
})
