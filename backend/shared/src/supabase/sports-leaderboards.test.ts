import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import * as pgPromise from 'pg-promise'
import { HIDE_FROM_LEADERBOARD_USER_IDS } from 'common/envs/constants'
import { MANIFOLD_SPORTS_USER_IDS } from 'common/sports'
import { topicBoardKey } from 'common/sports-leaderboards'
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
const SUPER_BOWL = 'super-bowl-topic'
// "⚽ 🏈 Football": groups sports, so it holds the NFL.
const FOOTBALL = 'Vcf6CYTTSXAiStbKSqQq'
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
  one: async (sql: string, params?: unknown[]) => {
    const { rows } = await db.query(pgp.as.format(sql, params))
    if (rows.length !== 1)
      throw new Error(`Expected one row, got ${rows.length}`)
    return rows[0]
  },
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

async function addProfits(
  rows: [string, string, number | 'NaN' | 'Infinity' | '1e400', string?][]
) {
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
    readFileSync(resolve(__dirname, '../../../supabase/user_bans.sql'), 'utf8')
  )
  for (const migration of [
    '2026102901_sports_leaderboards.sql',
    '2026102902_sports_leaderboard_positions.sql',
  ])
    await db.exec(
      readFileSync(
        resolve(__dirname, '../../../supabase/migrations', migration),
        'utf8'
      )
    )

  // 🏟️ Sports holds the NFL (a curated sport) and Cycling (a topic sport).
  // Super Bowl sits under the NFL, and Football groups the NFL.
  await db.query(
    `insert into groups (id, slug, name, total_members) values
       ($1, 'nfl', '🏈 NFL', 10),
       ($2, 'road-bicycle-racing', '🚲 Cycling', 5),
       ($3, 'politics-default', 'Politics', 50),
       ($4, 'super-bowl', '🏈 Super Bowl', 3),
       ($5, 'football', '⚽ 🏈 Football', 8)`,
    [NFL, CYCLING, OFF_TOPIC, SUPER_BOWL, FOOTBALL]
  )
  await db.query(
    `insert into group_groups (top_id, bottom_id) values
       ($1, $2), ($1, $3), ($2, $4), ($1, $5), ($5, $2)`,
    [SPORTS_DEFAULT_GROUP_ID, NFL, CYCLING, SUPER_BOWL, FOOTBALL]
  )
  for (const [id, data] of [
    ['alice', {}],
    ['bob', {}],
    ['carol', {}],
    ['dave', {}],
    ['erin', {}],
    ['mallory', { isBannedFromPosting: true }],
    // Deleted without the legacy flag, as many deleted accounts are.
    ['gone', { userDeleted: true }],
    ['nobets', {}],
    ['nomarkets', {}],
    ['nana', {}],
    ['infy', {}],
    ['huge', {}],
    [HIDDEN, {}],
    [BOT, {}],
  ] as const)
    await db.query(`insert into users (id, data) values ($1, $2)`, [
      id,
      JSON.stringify(data),
    ])
  // A betting ban takes nobets off the trader boards and a market-control ban
  // takes nomarkets off the creator boards. The rest move nobody: alice's
  // posting ban, bob's lifted ban and dave's expired one.
  await db.query(
    `insert into user_bans (user_id, ban_type, end_time, ended_at) values
       ('nobets', 'trading', null, null),
       ('nomarkets', 'marketControl', null, null),
       ('alice', 'posting', null, null),
       ('bob', 'trading', null, '2026-01-01'),
       ('bob', 'marketControl', null, '2026-01-01'),
       ('dave', 'trading', '2026-01-01', null),
       ('dave', 'marketControl', '2026-01-01', null)`
  )

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
    // A betting ban leaves its user on the creator boards.
    { id: 'cyc2', topics: [CYCLING], creator: 'nobets', traders: 1 },
    { id: 'nfl3', topics: [NFL], creator: 'nomarkets', traders: 9 },
    { id: 'nfl5', topics: [NFL], creator: 'gone', traders: 6 },
    { id: 'sb1', topics: [SUPER_BOWL], creator: 'erin', traders: 4 },
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
    ['dave', 'sb1', 30],
    ['carol', 'nfl2', -40],
    ['mallory', 'nfl1', 1000],
    ['gone', 'nfl1', 900],
    ['nobets', 'nfl1', 800],
    // A market-control ban leaves its user on the trader boards.
    ['nomarkets', 'cyc1', 10],
    [HIDDEN, 'nfl1', 500],
    // Broken positions: their sums aren't finite numbers.
    ['nana', 'nfl1', 'NaN'],
    ['infy', 'nfl1', 'Infinity'],
    // Past what a double holds: the rebuild must still run.
    ['huge', 'nfl1', '1e400'],
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
    // nfl, road-bicycle-racing, all, Super Bowl and Football, each with both
    // kinds.
    expect(await rebuildSportsLeaderboards(pg, NOW)).toBe(10)

    // Super Bowl markets count toward the NFL.
    expect(await board('nfl')).toEqual({
      profit: [
        ['bob', 200],
        ['alice', 100],
        ['dave', 30],
      ],
      creator: [
        ['carol', 5],
        ['erin', 4],
      ],
    })
    expect(await board('road-bicycle-racing')).toEqual({
      profit: [
        ['alice', 50],
        ['nomarkets', 10],
      ],
      creator: [
        ['dave', 3],
        ['nobets', 1],
      ],
    })
    expect(await board('all')).toEqual({
      profit: [
        ['bob', 220],
        ['alice', 150],
        ['dave', 30],
        ['nomarkets', 10],
      ],
      creator: [
        ['erin', 11],
        ['carol', 5],
        ['dave', 3],
        ['nobets', 1],
      ],
    })
    // A market with no sport of its own makes no board of its own.
    expect(await board('other')).toEqual({ profit: [], creator: [] })
  })

  it('ranks each other topic under Sports on what its page covers', async () => {
    expect(await board(topicBoardKey(SUPER_BOWL))).toEqual({
      profit: [['dave', 30]],
      creator: [['erin', 4]],
    })
    // Football covers the NFL and the Super Bowl under it, by their topics:
    // the bot's game, filed under the NFL by its league alone, isn't in them.
    expect(await board(topicBoardKey(FOOTBALL))).toEqual({
      profit: [
        ['bob', 200],
        ['alice', 100],
        ['dave', 30],
      ],
      creator: [
        ['carol', 5],
        ['erin', 4],
      ],
    })
    // A sport's main topic has the sport's board, not one of its own.
    expect(await board(topicBoardKey(NFL))).toEqual({ profit: [], creator: [] })
  })

  it('says where a user stands on a board, losses included', async () => {
    const you = async (board: string, userId: string) =>
      (await getSportsLeaderboards(pg, board, userId)).you
    // NFL traders: bob 200, alice 100, dave 30, carol -40. Creators: carol 5,
    // erin 4 (the bot's game and the poll don't count).
    expect(await you('nfl', 'alice')).toEqual({
      profit: { rank: 2, score: 100, of: 4 },
      creator: null,
    })
    expect(await you('nfl', 'carol')).toEqual({
      profit: { rank: 4, score: -40, of: 4 },
      creator: { rank: 1, score: 5, of: 2 },
    })
    expect(await you(topicBoardKey(SUPER_BOWL), 'dave')).toEqual({
      profit: { rank: 1, score: 30, of: 1 },
      creator: null,
    })
    // Each ban takes its user off only the board for what it blocks.
    expect(await you('all', 'nobets')).toEqual({
      profit: null,
      creator: { rank: 4, score: 1, of: 4 },
    })
    expect(await you('all', 'nomarkets')).toEqual({
      profit: { rank: 4, score: 10, of: 5 },
      creator: null,
    })
    // Banned, deleted, hidden, the bot as a creator, NaN and infinite scores,
    // and nobody at all.
    for (const userId of [
      'mallory',
      'gone',
      'nobets',
      'nomarkets',
      HIDDEN,
      BOT,
      'nana',
      'infy',
      'huge',
      'nobody',
    ])
      expect(await you('nfl', userId)).toEqual({ profit: null, creator: null })
    // Without a user, no `you`.
    expect((await getSportsLeaderboards(pg, 'nfl')).you).toBeUndefined()
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
    expect(await rebuildSportsLeaderboards(pg, NOW + 1000)).toBe(8)
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
      ['dave', 30],
    ])
    // And everyone's places, which the same transaction rewrites.
    expect((await getSportsLeaderboards(pg, 'nfl', 'alice')).you).toEqual({
      profit: { rank: 2, score: 100, of: 4 },
      creator: null,
    })
  })

  it("keeps the boards it has when the topic tree can't be read", async () => {
    // Markets to rank again, so only the failed read stops a write.
    await db.query(
      `insert into group_contracts (group_id, contract_id) values ($1, 'nfl1')`,
      [NFL]
    )
    await db.exec(`alter table group_groups rename to group_groups_away`)
    try {
      await expect(rebuildSportsLeaderboards(pg, NOW + 3000)).rejects.toThrow()
    } finally {
      await db.exec(`alter table group_groups_away rename to group_groups`)
    }
    expect((await getSportsLeaderboards(pg, 'nfl')).updatedTime).toBe(
      NOW + 1000
    )
  })

  it('shows the boards without places, and refuses to rebuild, before the places migration', async () => {
    await db.exec(`drop table sports_leaderboard_positions`)
    const b = await getSportsLeaderboards(pg, 'nfl', 'alice')
    expect(b.profit.length).toBeGreaterThan(0)
    expect(b.you).toEqual({ profit: null, creator: null })
    await expect(rebuildSportsLeaderboards(pg, NOW + 3500)).rejects.toThrow(
      /migration 2026102902/
    )
  })

  it('reads as not built yet, and refuses to rebuild, before the migration', async () => {
    await db.exec(`drop table sports_leaderboards`)
    expect(await getSportsLeaderboards(pg, 'nfl')).toEqual({
      profit: [],
      creator: [],
      updatedTime: null,
    })
    await expect(rebuildSportsLeaderboards(pg, NOW + 4000)).rejects.toThrow(
      /migration 2026102901/
    )
  })
})
