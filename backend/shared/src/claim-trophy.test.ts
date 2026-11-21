// "Getting started" trophy rewards: claiming a milestone pays its mana once,
// in the same transaction that records the claim.
//
// The real claim-trophy, get-user-trophies and unclaim-trophy handlers run
// here, with the real starter count, tier multiplier and payout
// (runTxnOutsideBetQueue). Their SQL runs, as pg-promise formats it, in an
// in-memory PostgreSQL built from the two trophy migrations plus minimal
// users, contracts, contract_bets, txns and user_entitlements tables. A
// transaction that fails is rolled back. No live database or network is used.
import { PGlite } from '@electric-sql/pglite'
import * as fs from 'fs'
import * as path from 'path'
import * as pgPromise from 'pg-promise'

const START = Date.UTC(2026, 11, 1)

jest.mock('api/helpers/endpoint', () => ({
  APIError: jest.requireActual('common/api/utils').APIError,
}))
jest.mock('api/helpers/rate-limit', () => ({
  onlyUsersWhoCanPerformAction: (_action: string, handler: unknown) => handler,
}))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
  pgp: jest.requireActual('pg-promise')(),
  SERIAL_MODE: {},
}))
jest.mock('shared/supabase/users', () => ({ broadcastUserUpdates: jest.fn() }))
jest.mock('api/get-user-achievements', () => ({
  loadUserAchievements: jest.fn(),
}))
// Starter trophies are off on prod; turn them on from START for this test.
jest.mock('common/trophies', () => {
  const actual = jest.requireActual('common/trophies')
  return {
    ...actual,
    isStarterTrophyAccount: (createdTime: number) =>
      actual.isStarterTrophyAccount(createdTime, Date.UTC(2026, 11, 1)),
  }
})

import { claimTrophy } from 'api/claim-trophy'
import { loadUserAchievements } from 'api/get-user-achievements'
import { getUserTrophies } from 'api/get-user-trophies'
import { unclaimTrophy } from 'api/unclaim-trophy'
import { APIResponse } from 'common/api/schema'
import { ENV_CONFIG } from 'common/envs/constants'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { broadcastUserUpdates } from 'shared/supabase/users'

const pgp = pgPromise()
let db: PGlite
const parsers = {
  20: (value: string) => parseInt(value, 10),
  1700: parseFloat,
  1114: (value: string) => value,
  1184: (value: string) => value,
}

const rows = async (sql: string, params?: unknown) =>
  (await db.query(pgp.as.format(sql, params))).rows as any[]

// The parts of pg-promise the handlers use.
const client = {
  oneOrNone: async (sql: string, params?: unknown) =>
    (await rows(sql, params))[0] ?? null,
  one: async (sql: string, params?: unknown) => {
    const result = await rows(sql, params)
    if (result.length !== 1) throw new Error('No data returned from the query.')
    return result[0]
  },
  many: async (sql: string, params?: unknown) => rows(sql, params),
  manyOrNone: async (sql: string, params?: unknown) => rows(sql, params),
  none: async (sql: string, params?: unknown) => {
    await rows(sql, params)
  },
  multi: async (sql: string) => (await db.exec(sql)).map((r) => r.rows),
  tx: async (...args: unknown[]) => {
    await db.exec('begin')
    try {
      const result = await (
        args[args.length - 1] as (tx: unknown) => Promise<unknown>
      )(client)
      await db.exec('commit')
      return result
    } catch (error) {
      await db.exec('rollback')
      throw error
    }
  },
}

const MIGRATIONS = [
  '2026112210_trophy_milestones.sql',
  '2026112211_trophy_milestone_rewards.sql',
]

beforeAll(async () => {
  db = new PGlite({ parsers })
  await db.exec(`
    create table users (
      id text primary key,
      created_time timestamptz not null default now(),
      data jsonb not null default '{}',
      balance numeric not null default 0,
      cash_balance numeric not null default 0,
      total_deposits numeric not null default 0,
      total_cash_deposits numeric not null default 0,
      is_bot boolean not null default false
    );
    create table user_bans (
      id serial primary key,
      user_id text not null,
      ban_type text not null,
      reason text,
      created_at timestamptz not null default now(),
      created_by text,
      end_time timestamptz,
      ended_at timestamptz,
      ended_by text
    );
    create table contracts (id text primary key, token text not null);
    create table contract_bets (
      bet_id text primary key,
      user_id text not null,
      contract_id text not null,
      amount numeric not null,
      created_time timestamptz not null,
      is_redemption boolean not null default false,
      is_api boolean
    );
    create table txns (
      id text primary key default md5(random()::text),
      created_time timestamptz not null default now(),
      data jsonb,
      amount numeric not null,
      category text not null,
      from_id text not null,
      from_type text not null,
      to_id text not null,
      to_type text not null,
      token text not null
    );
    create table user_entitlements (
      user_id text not null,
      entitlement_id text not null,
      granted_time timestamptz not null default now(),
      expires_time timestamptz,
      enabled boolean not null default true,
      auto_renew boolean not null default false,
      metadata jsonb,
      primary key (user_id, entitlement_id)
    );
    insert into contracts values
      ('m1', 'MANA'), ('m2', 'MANA'), ('m3', 'MANA'), ('cash1', 'CASH');
  `)
  const dir = path.resolve(__dirname, '../../supabase/migrations')
  for (const file of MIGRATIONS) {
    await db.exec(fs.readFileSync(path.join(dir, file), 'utf8'))
  }
  jest
    .mocked(createSupabaseDirectClient)
    .mockReturnValue(
      client as unknown as ReturnType<typeof createSupabaseDirectClient>
    )
})

afterAll(async () => {
  await db.close()
})

let betId = 0
beforeEach(async () => {
  await db.exec(`
    delete from user_trophy_milestones;
    delete from user_trophy_rewards;
    delete from user_showcase;
    delete from user_bans;
    delete from txns;
    delete from contract_bets;
    delete from user_entitlements;
    delete from users;
  `)
  jest.mocked(broadcastUserUpdates).mockClear()
})

const DAY = 24 * 60 * 60 * 1000
// Noon UTC is 4 am Pacific, so each `day` is its own Pacific day.
const at = (day: number) => new Date(START + DAY * day + 12 * 60 * 60 * 1000)

const addUser = async (
  id: string,
  opts: { createdTime?: number; data?: object } = {}
) =>
  rows(`insert into users (id, created_time, data) values ($1, $2, $3)`, [
    id,
    new Date(opts.createdTime ?? START + 1000),
    opts.data ?? {},
  ])

const bet = (
  userId: string,
  contractId: string,
  amount: number,
  day: number,
  extra: { isRedemption?: boolean; isApi?: boolean } = {}
) =>
  rows(
    `insert into contract_bets
      (bet_id, user_id, contract_id, amount, created_time, is_redemption, is_api)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      `bet-${betId++}`,
      userId,
      contractId,
      amount,
      at(day),
      extra.isRedemption ?? false,
      extra.isApi ?? null,
    ]
  )

// The handlers return plain responses; their type also allows { result,
// continue }, which these never use.
const claim = async (uid: string, trophyId: string, milestoneId: string) =>
  (await claimTrophy(
    { trophyId, milestoneId },
    { uid } as never,
    {} as never
  )) as APIResponse<'claim-trophy'>

const trophiesOf = async (userId: string) =>
  (await getUserTrophies(
    { userId },
    undefined as never,
    {} as never
  )) as APIResponse<'get-user-trophies'>

const unclaim = async (adminId: string, userId: string, trophyId: string) =>
  (await unclaimTrophy(
    { trophyId, userId },
    { uid: adminId } as never,
    {} as never
  )) as APIResponse<'unclaim-trophy'>

const balance = async (uid: string) =>
  (
    await rows(`select balance, total_deposits from users where id = $1`, [uid])
  )[0]

const rewardTxns = async (uid: string) =>
  rows(
    `select * from txns where to_id = $1 and category = 'TROPHY_REWARD' order by created_time`,
    [uid]
  )

const rewardRows = async (uid: string) =>
  rows(
    `select milestone_id, txn_id from user_trophy_rewards where user_id = $1 order by milestone_id`,
    [uid]
  )

const claimRows = async (uid: string) =>
  rows(`select * from user_trophy_milestones where user_id = $1`, [uid])

describe('starter stats', () => {
  it('count market-days whose buys add up to M10 in mana markets', async () => {
    await addUser('u')
    await bet('u', 'm1', 10, 0)
    await bet('u', 'm1', 25, 0) // same market and day: counts once
    await bet('u', 'm1', 10, 1) // same market, next day
    await bet('u', 'm2', 50, 1)
    await bet('u', 'm3', 9.99, 2) // under M10 on its own
    await bet('u', 'm3', -40, 2) // a sell
    await bet('u', 'm3', 30, 2, { isApi: true })
    await bet('u', 'm3', 30, 2, { isRedemption: true })
    await bet('u', 'cash1', 30, 2) // not a mana market

    expect((await trophiesOf('u')).starter).toEqual({
      starterTrades: 3,
      starterMarkets: 2,
      starterDays: 2,
    })
  })

  it('add up a purchase split across answers', async () => {
    await addUser('u')
    await bet('u', 'm1', 5, 0)
    await bet('u', 'm1', 5, 0)
    expect((await trophiesOf('u')).starter).toEqual({
      starterTrades: 1,
      starterMarkets: 1,
      starterDays: 1,
    })
  })

  it('are null for accounts created before the start', async () => {
    await addUser('old', { createdTime: START - 1 })
    await bet('old', 'm1', 100, 0)
    expect((await trophiesOf('old')).starter).toBeNull()
  })
})

describe('claiming a starter milestone', () => {
  it('pays the reward of it and every lower milestone once', async () => {
    await addUser('u')
    for (const [m, day] of [
      ['m1', 0],
      ['m2', 0],
      ['m3', 1],
    ] as const)
      await bet('u', m, 10, day)

    const first = await claim('u', 'starter-trades', 'hat-trick')
    expect(first.newlyClaimed.map((c) => c.milestoneId).sort()).toEqual([
      'first-trade',
      'hat-trick',
    ])
    expect(first.rewardAmount).toBe(100) // 50 + 50, free tier
    expect(await balance('u')).toEqual({ balance: 100, total_deposits: 100 })

    const [txn] = await rewardTxns('u')
    expect(txn).toMatchObject({
      amount: 100,
      from_type: 'BANK',
      to_type: 'USER',
      token: 'M$',
    })
    expect(txn.data.data).toMatchObject({
      trophyId: 'starter-trades',
      milestoneIds: ['first-trade', 'hat-trick'],
      baseAmount: 100,
      multiplier: 1,
    })
    expect(await rewardRows('u')).toEqual([
      { milestone_id: 'first-trade', txn_id: txn.id },
      { milestone_id: 'hat-trick', txn_id: txn.id },
    ])
    expect(broadcastUserUpdates).toHaveBeenCalledTimes(1)

    // Claiming again records and pays nothing.
    const again = await claim('u', 'starter-trades', 'hat-trick')
    expect(again.newlyClaimed).toEqual([])
    expect(again.rewardAmount).toBe(0)
    expect(await balance('u')).toEqual({ balance: 100, total_deposits: 100 })
    expect(await rewardTxns('u')).toHaveLength(1)
  })

  it('pays only the newly reached milestones when a higher one follows', async () => {
    await addUser('u')
    await bet('u', 'm1', 10, 0)
    expect(
      (await claim('u', 'starter-trades', 'first-trade')).rewardAmount
    ).toBe(50)
    await bet('u', 'm2', 10, 0)
    await bet('u', 'm3', 10, 0)
    expect((await claim('u', 'starter-trades', 'hat-trick')).rewardAmount).toBe(
      50
    )
    expect((await balance('u')).balance).toBe(100)
    expect(await rewardTxns('u')).toHaveLength(2)
  })

  it('refuses a milestone not reached yet and pays nothing', async () => {
    await addUser('u')
    await bet('u', 'm1', 10, 0)
    await expect(
      claim('u', 'starter-trades', 'getting-going')
    ).rejects.toMatchObject({ code: 403 })
    expect(await rewardTxns('u')).toHaveLength(0)
    expect(await claimRows('u')).toHaveLength(0)
  })

  it('refuses starter trophies for accounts created before the start', async () => {
    await addUser('old', { createdTime: START - 1 })
    await bet('old', 'm1', 10, 0)
    await expect(
      claim('old', 'starter-trades', 'first-trade')
    ).rejects.toMatchObject({ code: 403 })
    expect(await rewardTxns('old')).toHaveLength(0)
  })

  it('leaves a flagged account unpaid, and pays it once unflagged', async () => {
    await addUser('flagged', {
      data: { bonusEligibility: 'requires_verification' },
    })
    await bet('flagged', 'm1', 10, 0)
    const result = await claim('flagged', 'starter-trades', 'first-trade')
    expect(result.newlyClaimed).toHaveLength(1)
    expect(result.rewardAmount).toBe(0)
    expect(await rewardTxns('flagged')).toHaveLength(0)
    expect(await rewardRows('flagged')).toEqual([])

    await rows(
      `update users set data = '{"bonusEligibility": "verified"}' where id = 'flagged'`
    )
    const later = await claim('flagged', 'starter-trades', 'first-trade')
    expect(later.newlyClaimed).toEqual([])
    expect(later.rewardAmount).toBe(50)
    expect(await rewardTxns('flagged')).toHaveLength(1)
  })

  it('pays nothing to a bot account', async () => {
    await addUser('bot')
    await rows(`update users set is_bot = true where id = 'bot'`)
    await bet('bot', 'm1', 10, 0)
    const result = await claim('bot', 'starter-trades', 'first-trade')
    expect(result.rewardAmount).toBe(0)
    expect(await rewardTxns('bot')).toHaveLength(0)
  })

  it('re-checks bans and deletion under the lock', async () => {
    await addUser('banned')
    await bet('banned', 'm1', 10, 0)
    await rows(
      `insert into user_bans (user_id, ban_type) values ('banned', 'trading')`
    )
    await expect(
      claim('banned', 'starter-trades', 'first-trade')
    ).rejects.toMatchObject({ code: 403 })
    expect(await claimRows('banned')).toHaveLength(0)

    await addUser('deleted', { data: { userDeleted: true } })
    await bet('deleted', 'm1', 10, 0)
    await expect(
      claim('deleted', 'starter-trades', 'first-trade')
    ).rejects.toMatchObject({ code: 403 })
    expect(await rewardTxns('deleted')).toHaveLength(0)
  })

  it('ignores a ban that has ended or expired', async () => {
    await addUser('u')
    await bet('u', 'm1', 10, 0)
    await rows(
      `insert into user_bans (user_id, ban_type, ended_at) values ('u', 'trading', now())`
    )
    await rows(
      `insert into user_bans (user_id, ban_type, end_time) values ('u', 'posting', now() - interval '1 day')`
    )
    expect(
      (await claim('u', 'starter-trades', 'first-trade')).rewardAmount
    ).toBe(50)
  })

  it('applies the member multiplier', async () => {
    await addUser('member')
    await rows(
      `insert into user_entitlements (user_id, entitlement_id, expires_time, auto_renew)
       values ('member', 'supporter-basic', now() + interval '10 days', true)`
    )
    await bet('member', 'm1', 10, 0)
    const result = await claim('member', 'starter-trades', 'first-trade')
    expect(result.rewardAmount).toBe(75) // 50 x 1.5 for Plus
  })

  it('rolls back the claim when the payout fails', async () => {
    await addUser('u')
    await bet('u', 'm1', 10, 0)
    // Make the payout fail inside the transaction.
    await rows(
      `alter table txns add constraint no_rewards check (category <> 'TROPHY_REWARD')`
    )
    try {
      await expect(
        claim('u', 'starter-trades', 'first-trade')
      ).rejects.toThrow()
      expect(await claimRows('u')).toHaveLength(0)
      expect(await rewardRows('u')).toEqual([])
      expect((await balance('u')).balance).toBe(0)
    } finally {
      await rows(`alter table txns drop constraint no_rewards`)
    }
    // With the payout working again, the claim pays as usual.
    expect(
      (await claim('u', 'starter-trades', 'first-trade')).rewardAmount
    ).toBe(50)
  })
})

describe('other trophies', () => {
  it('claim without a reward, from achievement stats', async () => {
    await addUser('u')
    jest
      .mocked(loadUserAchievements)
      .mockResolvedValue({ totalVolumeMana: 20_000 } as never)
    const result = await claim('u', 'trading-volume', 'goldfish')
    expect(result.newlyClaimed.map((c) => c.milestoneId)).toEqual(['goldfish'])
    expect(result.rewardAmount).toBe(0)
    expect(await rewardTxns('u')).toHaveLength(0)
  })
})

describe('admin unclaim', () => {
  const admin = ENV_CONFIG.adminIds[0]

  it('removes the claims and pin, but a paid milestone never pays again', async () => {
    await addUser('u')
    await bet('u', 'm1', 10, 0)
    await claim('u', 'starter-trades', 'first-trade')
    await rows(
      `insert into user_showcase (user_id, pins) values ('u', array['trophy-starter-trades', 'league'])`
    )

    const { claims } = await unclaim(admin, 'u', 'starter-trades')
    expect(claims).toEqual([])
    expect(
      (await rows(`select pins from user_showcase where user_id = 'u'`))[0].pins
    ).toEqual(['league'])

    const again = await claim('u', 'starter-trades', 'first-trade')
    expect(again.newlyClaimed.map((c) => c.milestoneId)).toEqual([
      'first-trade',
    ])
    expect(again.rewardAmount).toBe(0)
    expect(await rewardTxns('u')).toHaveLength(1)
    expect((await balance('u')).balance).toBe(50)
  })
})
