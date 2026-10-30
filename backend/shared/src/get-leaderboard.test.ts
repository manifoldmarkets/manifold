import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import * as pgPromise from 'pg-promise'
import { getLeaderboard } from 'api/get-leaderboard'
import {
  createSupabaseDirectClient,
  SupabaseDirectClientTimeout,
} from './supabase/init'

// The handler's real SQL runs against an in-memory PostgreSQL, with the
// user_bans table from its schema file.
jest.mock('./supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
  pgp: jest.requireActual('pg-promise')(),
}))

jest.setTimeout(30_000)

const pgp = pgPromise()
let db: PGlite

// pg-promise formats the placeholders as it would in production; PGlite
// executes the result.
const client = {
  any: async (sql: string, params?: unknown) =>
    (await db.query(pgp.as.format(sql, params))).rows,
  map: async <T>(
    sql: string,
    params: unknown,
    fn: (row: Record<string, unknown>) => T
  ) =>
    (
      await db.query<Record<string, unknown>>(pgp.as.format(sql, params))
    ).rows.map(fn),
}

type Kind = 'profit' | 'loss' | 'volume' | 'creator' | 'referral'
type Handler = (props: {
  kind: Kind
  groupId?: string
  token: 'MANA'
  limit: number
}) => Promise<{ userId: string; score: number }[]>
const leaderboard = getLeaderboard as unknown as Handler

const TOPIC = 'topic-1'
const PAST = '2026-01-01'
const FUTURE = '2100-01-01'

// Ban rows: [type, end_time, ended_at].
type Ban = [string, string | null, string | null]

// Everyone trades, creates a market and refers someone, so each board would
// list them all; what keeps a user off is in their row and their bans.
const USERS: { id: string; data?: object; bans?: Ban[] }[] = [
  { id: 'clean' },
  // Deleted without the legacy flag, as many deleted accounts are.
  { id: 'gone', data: { userDeleted: true } },
  { id: 'legacy', data: { isBannedFromPosting: true } },
  { id: 'nobets', bans: [['trading', null, null]] },
  { id: 'nobetsyet', bans: [['trading', FUTURE, null]] },
  { id: 'nomarkets', bans: [['marketControl', null, null]] },
  { id: 'quiet', bans: [['posting', null, null]] },
  {
    id: 'lifted',
    bans: [
      ['trading', null, PAST],
      ['marketControl', null, PAST],
    ],
  },
  {
    id: 'expired',
    bans: [
      ['trading', PAST, null],
      ['marketControl', PAST, null],
    ],
  },
  { id: 'warned', bans: [['modAlert', null, null]] },
]
const without = (...ids: string[]) =>
  USERS.map((u) => u.id)
    .filter((id) => !ids.includes(id))
    .sort()

const ids = async (kind: Kind, groupId?: string) =>
  (await leaderboard({ kind, groupId, token: 'MANA', limit: 50 }))
    .map((e) => e.userId)
    .sort()

beforeAll(async () => {
  jest
    .mocked(createSupabaseDirectClient)
    .mockReturnValue(client as unknown as SupabaseDirectClientTimeout)
  db = new PGlite()
  await db.exec(`
    create table users (id text primary key, data jsonb not null);
    create table user_portfolio_history_latest (
      user_id text primary key, profit numeric not null
    );
    create table contracts (
      id text primary key, token text not null, outcome_type text not null,
      creator_id text not null, data jsonb not null
    );
    create table user_contract_metrics (
      user_id text not null, contract_id text not null, answer_id text,
      profit numeric, data jsonb not null
    );
    create table group_contracts (group_id text not null, contract_id text not null);
    create table user_referrals_profit (
      id text primary key, total_referrals int not null,
      total_referred_profit numeric, total_referred_cash_profit numeric
    );
  `)
  await db.exec(
    readFileSync(resolve(__dirname, '../../supabase/user_bans.sql'), 'utf8')
  )
  // Scores fall down the list: clean 100, gone 99, ... warned 91.
  for (const [i, u] of USERS.entries()) {
    const score = 100 - i
    const market = `m-${u.id}`
    await db.query(`insert into users (id, data) values ($1, $2)`, [
      u.id,
      JSON.stringify(u.data ?? {}),
    ])
    for (const [type, endTime, endedAt] of u.bans ?? [])
      await db.query(
        `insert into user_bans (user_id, ban_type, end_time, ended_at)
         values ($1, $2, $3, $4)`,
        [u.id, type, endTime, endedAt]
      )
    await db.query(
      `insert into user_portfolio_history_latest (user_id, profit) values ($1, $2)`,
      [u.id, score]
    )
    await db.query(
      `insert into contracts (id, token, outcome_type, creator_id, data)
       values ($1, 'MANA', 'BINARY', $2, $3)`,
      [market, u.id, JSON.stringify({ uniqueBettorCount: score })]
    )
    await db.query(
      `insert into group_contracts (group_id, contract_id) values ($1, $2)`,
      [TOPIC, market]
    )
    await db.query(
      `insert into user_contract_metrics (user_id, contract_id, profit, data)
       values ($1, $2, $3, $4)`,
      [u.id, market, score, JSON.stringify({ totalAmountInvested: score })]
    )
    await db.query(
      `insert into user_referrals_profit (id, total_referrals) values ($1, $2)`,
      [u.id, score]
    )
  }
})

afterAll(async () => {
  await db.close()
})

describe('leaderboard', () => {
  it('leaves deleted accounts and betting bans off the trader boards', async () => {
    const traders = without('gone', 'legacy', 'nobets', 'nobetsyet')
    expect(await ids('profit')).toEqual(traders)
    expect(await ids('loss')).toEqual(traders)
    expect(await ids('profit', TOPIC)).toEqual(traders)
    expect(await ids('loss', TOPIC)).toEqual(traders)
    expect(await ids('volume')).toEqual(traders)
  })

  it('leaves deleted accounts and market-control bans off the creator boards', async () => {
    const creators = without('gone', 'legacy', 'nomarkets')
    expect(await ids('creator')).toEqual(creators)
    expect(await ids('creator', TOPIC)).toEqual(creators)
  })

  it('leaves only deleted accounts and the legacy full ban off referrals', async () => {
    expect(await ids('referral')).toEqual(without('gone', 'legacy'))
  })

  it('keeps each board in order', async () => {
    const top = async (kind: Kind) =>
      (await leaderboard({ kind, token: 'MANA', limit: 3 })).map((e) => [
        e.userId,
        Number(e.score),
      ])
    expect(await top('profit')).toEqual([
      ['clean', 100],
      ['nomarkets', 95],
      ['quiet', 94],
    ])
    expect(await top('loss')).toEqual([
      ['warned', 91],
      ['expired', 92],
      ['lifted', 93],
    ])
    expect(await top('creator')).toEqual([
      ['clean', 100],
      ['nobets', 97],
      ['nobetsyet', 96],
    ])
    expect(await top('referral')).toEqual([
      ['clean', 100],
      ['nobets', 97],
      ['nobetsyet', 96],
    ])
  })
})
