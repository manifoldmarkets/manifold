import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import * as pgPromise from 'pg-promise'
import { HIDE_FROM_LEADERBOARD_USER_IDS } from 'common/envs/constants'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { SPORTS_DEFAULT_GROUP_ID } from 'common/sports-schedule'
import { SupabaseDirectClient } from './init'
import {
  getSportsLeaderboards,
  rebuildSportsLeaderboards,
} from './sports-leaderboards'

// The rebuild's real SQL runs against an in-memory PostgreSQL, with the
// sports_leaderboards table from its migration.
jest.mock('./init', () => ({
  createSupabaseDirectClient: jest.fn(() => {
    throw new Error('This test must not create a network database client')
  }),
}))
jest.mock('shared/utils', () => ({
  log: Object.assign(jest.fn(), { error: jest.fn(), warn: jest.fn() }),
}))

jest.setTimeout(30_000)

const NOW = Date.parse('2026-10-29T12:00:00Z')
const NFL = 'TNQwmbE5p6dnKx2e6Qlp'
const CYCLING = 'cycling-topic'
const OFF_TOPIC = 'politics-topic'
const BOT = MANIFOLD_SPORTS_USER_IDS[0]
const HIDDEN = HIDE_FROM_LEADERBOARD_USER_IDS[0]

const pgp = pgPromise()
let db: PGlite

// pg-promise formats the placeholders (arrays, jsonb, dates) as it would
// in production; PGlite executes the result.
const client = {
  manyOrNone: async (sql: string, params: unknown[]) =>
    (await db.query(pgp.as.format(sql, params))).rows,
  none: async (sql: string, params?: unknown[]) => {
    await db.exec(pgp.as.format(sql, params))
  },
  tx: async <T>(fn: (tx: unknown) => Promise<T>) => {
    await db.exec('begin')
    try {
      const result = await fn(client)
      await db.exec('commit')
      return result
    } catch (e) {
      await db.exec('rollback')
      throw e
    }
  },
}
const pg = client as unknown as SupabaseDirectClient

type Market = {
  id: string
  topics: string[]
  creator: string
  traders: number
  token?: string
  outcomeType?: string
  isRanked?: boolean
  sportsLeague?: string
}

async function addMarkets(markets: Market[]) {
  for (const m of markets) {
    const data = {
      uniqueBettorCount: m.traders,
      ...(m.isRanked === false ? { isRanked: false } : {}),
      ...(m.sportsLeague ? { sportsLeague: m.sportsLeague } : {}),
    }
    await db.query(
      `insert into contracts (id, token, outcome_type, creator_id, data)
       values ($1, $2, $3, $4, $5)`,
      [
        m.id,
        m.token ?? 'MANA',
        m.outcomeType ?? 'BINARY',
        m.creator,
        JSON.stringify(data),
      ]
    )
    for (const t of m.topics)
      await db.query(
        `insert into group_contracts (group_id, contract_id) values ($1, $2)`,
        [t, m.id]
      )
  }
}

async function addProfits(rows: [string, string, number, string?][]) {
  for (const [userId, contractId, profit, answerId] of rows)
    await db.query(
      `insert into user_contract_metrics (user_id, contract_id, profit, answer_id)
       values ($1, $2, $3, $4)`,
      [userId, contractId, profit, answerId ?? null]
    )
}

const board = async (sport: string) => {
  const b = await getSportsLeaderboards(pg, sport)
  const pairs = (entries: { userId: string; score: number }[]) =>
    entries.map((e) => [e.userId, e.score])
  return { profit: pairs(b.profit), creator: pairs(b.creator) }
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create table groups (
      id text primary key, slug text not null, name text not null,
      total_members int, privacy_status text not null default 'public'
    );
    create table group_groups (top_id text not null, bottom_id text not null);
    create table group_contracts (
      group_id text not null, contract_id text not null,
      primary key (group_id, contract_id)
    );
    create table contracts (
      id text primary key, token text not null, outcome_type text not null,
      creator_id text not null, data jsonb not null
    );
    create table user_contract_metrics (
      user_id text not null, contract_id text not null, answer_id text,
      profit numeric
    );
    create table users (id text primary key, data jsonb not null);
  `)
  await db.exec(
    readFileSync(
      resolve(
        __dirname,
        '../../../supabase/migrations/2026102901_sports_leaderboards.sql'
      ),
      'utf8'
    )
  )

  // 🏟️ Sports holds the NFL (a curated sport) and Cycling (a topic sport).
  await db.query(
    `insert into groups (id, slug, name, total_members) values
       ($1, 'nfl', '🏈 NFL', 10),
       ($2, 'road-bicycle-racing', '🚲 Cycling', 5),
       ($3, 'politics-default', 'Politics', 50)`,
    [NFL, CYCLING, OFF_TOPIC]
  )
  await db.query(
    `insert into group_groups (top_id, bottom_id) values ($1, $2), ($1, $3)`,
    [SPORTS_DEFAULT_GROUP_ID, NFL, CYCLING]
  )
  for (const [id, banned] of [
    ['alice', false],
    ['bob', false],
    ['carol', false],
    ['dave', false],
    ['erin', false],
    ['mallory', true],
    [HIDDEN, false],
    [BOT, false],
  ] as const)
    await db.query(`insert into users (id, data) values ($1, $2)`, [
      id,
      JSON.stringify(banned ? { isBannedFromPosting: true } : {}),
    ])

  await addMarkets([
    {
      id: 'nfl1',
      topics: [SPORTS_DEFAULT_GROUP_ID, NFL],
      creator: 'carol',
      traders: 5,
    },
    // The sports bot's game market, filed by its league.
    {
      id: 'nfl2',
      topics: [SPORTS_DEFAULT_GROUP_ID],
      creator: BOT,
      traders: 100,
      sportsLeague: 'NFL',
    },
    { id: 'cyc1', topics: [CYCLING], creator: 'dave', traders: 3 },
    // Under Sports with no sport of its own: All only.
    {
      id: 'gen1',
      topics: [SPORTS_DEFAULT_GROUP_ID],
      creator: 'erin',
      traders: 7,
    },
    {
      id: 'poll1',
      topics: [NFL],
      creator: 'carol',
      traders: 50,
      outcomeType: 'POLL',
    },
    {
      id: 'cash1',
      topics: [NFL],
      creator: 'carol',
      traders: 40,
      token: 'CASH',
    },
    {
      id: 'unranked1',
      topics: [NFL],
      creator: 'carol',
      traders: 30,
      isRanked: false,
    },
    { id: 'off1', topics: [OFF_TOPIC], creator: 'carol', traders: 20 },
  ])
  await addProfits([
    ['alice', 'nfl1', 100],
    ['alice', 'cyc1', 50],
    // Per-answer rows don't count; the market's total row does.
    ['alice', 'nfl1', 999, 'answer-1'],
    ['alice', 'cash1', 10000],
    ['alice', 'unranked1', 10000],
    ['alice', 'off1', 10000],
    ['bob', 'nfl1', 200],
    ['bob', 'gen1', 20],
    ['carol', 'nfl2', -40],
    ['mallory', 'nfl1', 1000],
    [HIDDEN, 'nfl1', 500],
  ])
})

afterAll(async () => {
  await db.close()
})

describe('sports leaderboards', () => {
  it('has no rebuild time before the first run', async () => {
    const b = await getSportsLeaderboards(pg, 'nfl')
    expect(b).toEqual({ profit: [], creator: [], updatedTime: null })
  })

  it("ranks each sport's traders and creators, and All across them", async () => {
    // nfl, road-bicycle-racing and all, each with both kinds.
    expect(await rebuildSportsLeaderboards(pg, NOW)).toBe(6)

    expect(await board('nfl')).toEqual({
      profit: [
        ['bob', 200],
        ['alice', 100],
      ],
      creator: [['carol', 5]],
    })
    expect(await board('road-bicycle-racing')).toEqual({
      profit: [['alice', 50]],
      creator: [['dave', 3]],
    })
    expect(await board('all')).toEqual({
      profit: [
        ['bob', 220],
        ['alice', 150],
      ],
      creator: [
        ['erin', 7],
        ['carol', 5],
        ['dave', 3],
      ],
    })
    // A market with no sport of its own makes no board of its own.
    expect(await board('other')).toEqual({ profit: [], creator: [] })
  })

  it('reports when the boards were built, for any sport', async () => {
    expect((await getSportsLeaderboards(pg, 'nfl')).updatedTime).toBe(NOW)
    expect(await getSportsLeaderboards(pg, 'curling')).toEqual({
      profit: [],
      creator: [],
      updatedTime: NOW,
    })
  })

  it('replaces every board, so a sport that empties out loses its board', async () => {
    await db.exec(`delete from group_contracts where group_id = '${CYCLING}'`)
    expect(await rebuildSportsLeaderboards(pg, NOW + 1000)).toBe(4)
    expect(await board('road-bicycle-racing')).toEqual({
      profit: [],
      creator: [],
    })
    expect((await getSportsLeaderboards(pg, 'nfl')).updatedTime).toBe(
      NOW + 1000
    )
  })

  it('keeps the boards it has when there is nothing to rank', async () => {
    await db.exec(`delete from group_contracts`)
    expect(await rebuildSportsLeaderboards(pg, NOW + 2000)).toBe(0)
    expect((await board('nfl')).profit).toEqual([
      ['bob', 200],
      ['alice', 100],
    ])
  })
})
