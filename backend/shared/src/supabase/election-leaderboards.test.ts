import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import * as pgPromise from 'pg-promise'
import { HIDE_FROM_LEADERBOARD_USER_IDS } from 'common/envs/constants'
import {
  ELECTION_LEADERBOARD_KEYS,
  ELECTION_LEADERBOARD_SERVED,
  ELECTION_LEADERBOARDS,
  ElectionLeaderboardKey,
} from 'common/election-leaderboards'
import { SupabaseDirectClient } from './init'
import {
  assembleElectionLeaderboards,
  dueElectionBoards,
  getElectionLeaderboards,
  parseStoredEntries,
  rankEntries,
  rebuildElectionLeaderboards,
  StoredBoardTime,
} from './election-leaderboards'

jest.mock('./init', () => ({
  createSupabaseDirectClient: jest.fn(() => {
    throw new Error('This test must not create a network database client')
  }),
}))
jest.mock('shared/utils', () => ({
  log: Object.assign(jest.fn(), { error: jest.fn(), warn: jest.fn() }),
}))

jest.setTimeout(30_000)

const NOW = Date.parse('2026-11-06T12:00:00Z')
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

const slugsOf = (key: ElectionLeaderboardKey) => {
  const board = ELECTION_LEADERBOARDS.find((b) => b.key === key)
  if (!board) throw new Error(`no board ${key}`)
  return board.topicSlugs
}

describe('ELECTION_LEADERBOARDS', () => {
  it('lists the boards in key order', () => {
    expect(ELECTION_LEADERBOARDS.map((b) => b.key)).toEqual([
      ...ELECTION_LEADERBOARD_KEYS,
    ])
    expect(ELECTION_LEADERBOARDS.map((b) => b.label)).toEqual([
      '2026 midterms',
      '2028',
      '2030 midterms',
      'All US elections',
      'US politics',
    ])
    for (const b of ELECTION_LEADERBOARDS)
      expect(b.refreshHours).toBeGreaterThan(0)
  })

  it('has no duplicate topics on a board', () => {
    for (const b of ELECTION_LEADERBOARDS)
      expect(new Set(b.topicSlugs).size).toBe(b.topicSlugs.length)
  })

  it('nests the cycles in all US elections, and those in US politics', () => {
    const elections = slugsOf('us-elections')
    for (const key of ['2026', '2028', '2030'] as const)
      expect(elections).toEqual(expect.arrayContaining(slugsOf(key)))
    const politics = slugsOf('us-politics')
    expect(politics).toEqual(expect.arrayContaining(elections))
    expect(politics).toContain('us-politics')
    expect(elections).not.toContain('us-politics')
  })
})

describe('dueElectionBoards', () => {
  const builtAt = (age: Record<string, number>): StoredBoardTime[] =>
    Object.entries(age).flatMap(([board, ms]) =>
      ['profit', 'creator'].map((kind) => ({
        board,
        kind,
        updatedTime: NOW - ms,
      }))
    )
  const due = (stored: StoredBoardTime[]) =>
    dueElectionBoards(stored, NOW).map((b) => b.key)

  it('rebuilds every board when nothing is stored', () => {
    expect(due([])).toEqual([...ELECTION_LEADERBOARD_KEYS])
  })

  it('skips boards built within their refresh period', () => {
    expect(
      due(
        builtAt({
          '2026': 10 * MINUTE,
          '2028': 0,
          '2030': 54 * MINUTE,
          'us-elections': 5 * HOUR + 50 * MINUTE,
          'us-politics': HOUR,
        })
      )
    ).toEqual([])
  })

  it("doesn't skip a run over a few seconds of jitter", () => {
    expect(
      due(
        builtAt({
          '2026': 59 * MINUTE + 58 * 1000,
          '2028': 56 * MINUTE,
          '2030': HOUR,
          'us-elections': 5 * HOUR + 59 * MINUTE,
          'us-politics': 6 * HOUR + MINUTE,
        })
      )
    ).toEqual([...ELECTION_LEADERBOARD_KEYS])
  })

  it('rebuilds a board missing a kind or with an unreadable time', () => {
    const stored = builtAt({
      '2026': 0,
      '2028': 0,
      '2030': 0,
      'us-elections': 0,
      'us-politics': 0,
    })
    const withoutCreator2026 = stored.filter(
      (s) => !(s.board === '2026' && s.kind === 'creator')
    )
    expect(due(withoutCreator2026)).toEqual(['2026'])
    const badTime = stored.map((s) =>
      s.board === 'us-politics' && s.kind === 'profit'
        ? { ...s, updatedTime: NaN }
        : s
    )
    expect(due(badTime)).toEqual(['us-politics'])
  })

  it('goes by the older kind', () => {
    const stored = builtAt({
      '2026': 0,
      '2028': 0,
      '2030': 0,
      'us-elections': 0,
      'us-politics': 0,
    }).map((s) =>
      s.board === '2028' && s.kind === 'profit'
        ? { ...s, updatedTime: NOW - 2 * HOUR }
        : s
    )
    expect(due(stored)).toEqual(['2028'])
  })
})

describe('rankEntries', () => {
  it('parses scores, drops unusable ones, and ranks best first', () => {
    expect(
      rankEntries(
        [
          { userId: 'b', score: '10' },
          { userId: 'nan', score: 'NaN' },
          { userId: 'inf', score: 'Infinity' },
          { userId: 'huge', score: '1e400' },
          { userId: 'null', score: null },
          { userId: 'empty', score: '' },
          { userId: 'c', score: -5 },
          { userId: 'a', score: 10 },
          { userId: 'd', score: '12.5' },
        ],
        10
      )
    ).toEqual([
      { userId: 'd', score: 12.5 },
      { userId: 'a', score: 10 },
      { userId: 'b', score: 10 },
      { userId: 'c', score: -5 },
    ])
  })

  it('keeps at most `size`', () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({
      userId: `u${i}`,
      score: i,
    }))
    const top = rankEntries(rows, 50)
    expect(top).toHaveLength(50)
    expect(top[0]).toEqual({ userId: 'u59', score: 59 })
    expect(top[49]).toEqual({ userId: 'u10', score: 10 })
  })
})

describe('parseStoredEntries', () => {
  it('reads only well-formed entries', () => {
    expect(parseStoredEntries(null, 20)).toEqual([])
    expect(parseStoredEntries({ userId: 'a', score: 1 }, 20)).toEqual([])
    expect(
      parseStoredEntries(
        [
          { userId: 'a', score: 3 },
          { userId: 'b', score: '4' },
          { userId: 5, score: 5 },
          null,
          'c',
          { userId: 'd', score: 7 },
        ],
        20
      )
    ).toEqual([
      { userId: 'd', score: 7 },
      { userId: 'a', score: 3 },
    ])
  })
})

describe('assembleElectionLeaderboards', () => {
  const entries = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ userId: `u${i}`, score: n - i }))
  const row = (board: string, kind: string, at: number, n = 3) => ({
    board,
    kind,
    entries: entries(n),
    updated_time: new Date(at),
  })

  it('serves complete boards in order, trimmed', () => {
    const { boards } = assembleElectionLeaderboards([
      row('us-politics', 'creator', NOW),
      row('us-politics', 'profit', NOW - HOUR, 50),
      row('2026', 'creator', NOW),
      row('2026', 'profit', NOW),
      // No creator row: left out.
      row('2028', 'profit', NOW),
      row('not-a-board', 'profit', NOW),
      row('not-a-board', 'creator', NOW),
    ])
    expect(boards.map((b) => [b.key, b.label, b.updatedTime])).toEqual([
      ['2026', '2026 midterms', NOW],
      ['us-politics', 'US politics', NOW - HOUR],
    ])
    expect(boards[1].profit).toHaveLength(ELECTION_LEADERBOARD_SERVED)
    expect(boards[1].profit[0]).toEqual({ userId: 'u0', score: 50 })
    expect(boards[1].creator).toHaveLength(3)
  })
})

// The rebuild's real SQL runs against an in-memory PostgreSQL, with the
// election_leaderboards table from its migration.
describe('rebuild and read', () => {
  const pgp = pgPromise()
  let db: PGlite

  // pg-promise formats the placeholders (arrays, jsonb, dates) as it would
  // in production; PGlite executes the result.
  const clientFor = (getDb: () => PGlite) =>
    ({
      manyOrNone: async (sql: string, params?: unknown[]) =>
        (await getDb().query(pgp.as.format(sql, params))).rows,
      one: async (sql: string, params?: unknown[]) => {
        const { rows } = await getDb().query(pgp.as.format(sql, params))
        if (rows.length !== 1)
          throw new Error(`Expected one row, got ${rows.length}`)
        return rows[0]
      },
      none: async (sql: string, params?: unknown[]) => {
        await getDb().exec(pgp.as.format(sql, params))
      },
    } as unknown as SupabaseDirectClient)
  const pg = clientFor(() => db)

  const HIDDEN = HIDE_FROM_LEADERBOARD_USER_IDS[0]

  type Market = {
    id: string
    topics: string[]
    creator: string
    traders: number
    token?: string
    outcomeType?: string
    isRanked?: boolean
  }

  async function addMarkets(markets: Market[]) {
    for (const m of markets) {
      const data = {
        uniqueBettorCount: m.traders,
        ...(m.isRanked === false ? { isRanked: false } : {}),
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
    rows: [string, string, number | 'NaN' | 'Infinity', string?][]
  ) {
    for (const [userId, contractId, profit, answerId] of rows)
      await db.query(
        `insert into user_contract_metrics (user_id, contract_id, profit, answer_id)
         values ($1, $2, $3, $4)`,
        [userId, contractId, profit, answerId ?? null]
      )
  }

  const BASE_TABLES = `
    create table groups (id text primary key, slug text not null);
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
  `

  const pairs = (entries: { userId: string; score: number }[]) =>
    entries.map((e) => [e.userId, e.score])
  const served = async () => {
    const { boards } = await getElectionLeaderboards(pg)
    return Object.fromEntries(
      boards.map((b) => [
        b.key,
        {
          updatedTime: b.updatedTime,
          profit: pairs(b.profit),
          creator: pairs(b.creator),
        },
      ])
    )
  }

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(BASE_TABLES)
    await db.exec(
      readFileSync(
        resolve(
          __dirname,
          '../../../supabase/migrations/2026110601_election_leaderboards.sql'
        ),
        'utf8'
      )
    )

    // No 2030 topics exist here, so that board fails every run.
    await db.query(
      `insert into groups (id, slug) values
         ('g26a', '2026-midterms'),
         ('g26b', '2026-us-election'),
         ('g28', '2028-us-elections'),
         ('g24', '2024-us-presidential-election'),
         ('gpol', 'us-politics'),
         ('gsports', 'sports-default')`
    )
    for (const [id, banned] of [
      ['alice', false],
      ['bob', false],
      ['carol', false],
      ['dave', false],
      ['erin', false],
      ['zed', false],
      ['mallory', true],
      ['nana', false],
      ['infy', false],
      [HIDDEN, false],
    ] as const)
      await db.query(`insert into users (id, data) values ($1, $2)`, [
        id,
        JSON.stringify(banned ? { isBannedFromPosting: true } : {}),
      ])

    await addMarkets([
      // In two of the 2026 topics: counts once.
      { id: 'm1', topics: ['g26a', 'g26b'], creator: 'carol', traders: 10 },
      {
        id: 'unranked',
        topics: ['g26a'],
        creator: 'zed',
        traders: 100,
        isRanked: false,
      },
      {
        id: 'cash',
        topics: ['g26b'],
        creator: 'zed',
        traders: 100,
        token: 'CASH',
      },
      // Polls count for profit, not for creators.
      {
        id: 'poll',
        topics: ['g26a'],
        creator: 'erin',
        traders: 100,
        outcomeType: 'POLL',
      },
      { id: 'm28', topics: ['g28'], creator: 'dave', traders: 7 },
      // A banned creator's market: its traders' profit counts.
      { id: 'm28b', topics: ['g28'], creator: 'mallory', traders: 50 },
      { id: 'm24', topics: ['g24'], creator: 'dave', traders: 4 },
      { id: 'mpol', topics: ['gpol'], creator: 'carol', traders: 3 },
      { id: 'off', topics: ['gsports'], creator: 'zed', traders: 1000 },
    ])
    await addProfits([
      ['alice', 'm1', 100],
      // An answer's own row; the market's row (answer_id null) has the total.
      ['alice', 'm1', 999, 'answer1'],
      ['alice', 'poll', 20],
      ['alice', 'unranked', 1000],
      ['alice', 'cash', 1000],
      ['alice', 'off', 1000],
      ['bob', 'm1', -30],
      ['bob', 'm28', 60],
      ['erin', 'm28b', 5],
      ['mallory', 'm1', 500],
      [HIDDEN, 'm1', 400],
      ['nana', 'm1', 'NaN'],
      ['infy', 'm28', 'Infinity'],
      ['carol', 'm24', 25],
      ['carol', 'mpol', 50],
    ])
  })

  it('serves nothing and refuses to rebuild before the migration', async () => {
    const bare = new PGlite()
    await bare.exec(BASE_TABLES)
    const bareClient = clientFor(() => bare)
    expect(await getElectionLeaderboards(bareClient)).toEqual({ boards: [] })
    await expect(rebuildElectionLeaderboards(bareClient, NOW)).rejects.toThrow(
      'run migration 2026110601 first'
    )
    await bare.close()
  })

  it('builds every board, counting each market once', async () => {
    expect(await rebuildElectionLeaderboards(pg, NOW)).toEqual({
      rebuilt: ['2026', '2028', 'us-elections', 'us-politics'],
      skipped: [],
      failed: ['2030'],
    })
    expect(await served()).toEqual({
      '2026': {
        updatedTime: NOW,
        profit: [
          ['alice', 120],
          ['bob', -30],
        ],
        creator: [['carol', 10]],
      },
      '2028': {
        updatedTime: NOW,
        profit: [
          ['bob', 60],
          ['erin', 5],
        ],
        creator: [['dave', 7]],
      },
      'us-elections': {
        updatedTime: NOW,
        profit: [
          ['alice', 120],
          ['bob', 30],
          ['carol', 25],
          ['erin', 5],
        ],
        creator: [
          ['dave', 11],
          ['carol', 10],
        ],
      },
      'us-politics': {
        updatedTime: NOW,
        profit: [
          ['alice', 120],
          ['carol', 75],
          ['bob', 30],
          ['erin', 5],
        ],
        creator: [
          ['carol', 13],
          ['dave', 11],
        ],
      },
    })
  })

  it('rebuilds each board when its refresh period is up', async () => {
    // Half an hour on: only the board that has never built is due.
    expect(await rebuildElectionLeaderboards(pg, NOW + 30 * MINUTE)).toEqual({
      rebuilt: [],
      skipped: ['2026', '2028', 'us-elections', 'us-politics'],
      failed: ['2030'],
    })

    // An hour on, a trade later: the hourly boards pick it up; the 6-hourly
    // ones keep what they had.
    await addProfits([['dave', 'm1', 40]])
    const later = NOW + HOUR - 10 * 1000
    expect(await rebuildElectionLeaderboards(pg, later)).toEqual({
      rebuilt: ['2026', '2028'],
      skipped: ['us-elections', 'us-politics'],
      failed: ['2030'],
    })
    const boards = await served()
    expect(boards['2026'].updatedTime).toBe(later)
    expect(boards['2026'].profit).toEqual([
      ['alice', 120],
      ['dave', 40],
      ['bob', -30],
    ])
    expect(boards['us-politics'].updatedTime).toBe(NOW)
    expect(boards['us-politics'].profit).not.toContainEqual(['dave', 40])
  })

  it("keeps a board's stored rows when its rebuild fails", async () => {
    const before = (await served())['2028']
    await db.query(`delete from groups where id = 'g28'`)
    const result = await rebuildElectionLeaderboards(pg, NOW + 3 * HOUR)
    expect(result.failed).toEqual(['2028', '2030'])
    expect(result.rebuilt).toEqual(['2026'])
    expect((await served())['2028']).toEqual(before)
  })
})
