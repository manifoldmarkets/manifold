// Onboarding trophy rewards: claiming a milestone pays its mana once,
// in the same transaction that records the claim.
//
// Runs the claim, profile and nightly rank SQL against in-memory PostgreSQL
// with the trophy migrations and the achievement materialized views.
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
  READ_ONLY_REPEATABLE_MODE: {},
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
import { setShowcasePins } from 'api/set-showcase-pins'
import { unclaimTrophy } from 'api/unclaim-trophy'
import { APIResponse } from 'common/api/schema'
import { BANNED_TRADING_USER_IDS, ENV_CONFIG } from 'common/envs/constants'
import { RANKED_TROPHY_DEFINITIONS, getTrophyStatValue } from 'common/trophies'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { broadcastUserUpdates } from 'shared/supabase/users'
import { updateTrophyRanks } from 'scheduler/jobs/update-trophy-ranks'

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
  // Like pg-promise: a statement run with none() must not return rows.
  none: async (sql: string, params?: unknown) => {
    if ((await rows(sql, params)).length) {
      throw new Error('No return data was expected.')
    }
  },
  multi: async (sql: string) => (await db.exec(sql)).map((r) => r.rows),
  tx: async (...args: unknown[]) => {
    const { mode } = args[0] as { mode?: unknown }
    await db.exec(
      mode instanceof pgp.txMode.TransactionMode ? mode.begin() : 'begin'
    )
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
  '2026112501_user_reactions_comment_likes_idx.sql',
  '2026112502_trophy_ladders_v2.sql',
]

beforeAll(async () => {
  db = new PGlite({ parsers })
  await db.exec(`
    create table users (
      id text primary key,
      username text,
      created_time timestamptz not null default now(),
      data jsonb not null default '{}',
      balance numeric not null default 0,
      cash_balance numeric not null default 0,
      total_deposits numeric not null default 0,
      total_cash_deposits numeric not null default 0,
      is_bot boolean not null default false
    );
    create table user_reactions (content_owner_id text, content_id text, content_type text, reaction_type text, user_id text);
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
    create table user_portfolio_history_latest (
      user_id text primary key, balance numeric not null, investment_value numeric not null,
      spice_balance numeric default 0, total_deposits numeric default 0, last_calculated timestamptz not null default now()
    );
    create table user_stats (user_id text primary key, trades int);
    create table user_stats_baseline (user_id text primary key, trades int);
    create table user_referrals_profit (id text, total_referrals int, total_referred_profit numeric);
    create table contract_comments (comment_id text primary key, contract_id text not null, user_id text, data jsonb);
    create table old_posts (id text primary key);
    create table old_post_comments (comment_id text, post_id text not null, user_id text, data jsonb);
    create table user_contract_metrics (user_id text, contract_id text, answer_id text, profit numeric, data jsonb);
    create table contracts (
      id text primary key, token text not null, creator_id text, resolution text,
      visibility text, deleted boolean, unique_bettor_count int, mechanism text, data jsonb, close_time timestamptz
    );
    create table answers (id text primary key, contract_id text, resolution text);
    create table system_trading_status (token text primary key, status boolean not null);
    insert into system_trading_status values ('MANA', true), ('CASH', false);
    create table contract_bets (
      bet_id text primary key,
      user_id text not null,
      contract_id text not null,
      amount numeric not null,
      created_time timestamptz not null,
      data jsonb not null default '{}',
      is_redemption boolean,
      is_api boolean,
      is_filled boolean,
      is_cancelled boolean,
      expires_at timestamptz,
      answer_id text
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
    create table leagues_season_end_times (
      season integer primary key,
      status text not null
    );
    create table leagues (
      season integer not null,
      division integer not null,
      cohort text not null,
      user_id text not null,
      mana_earned numeric,
      primary key (user_id, season)
    );
    insert into contracts (id, token, mechanism) values
      ('m1', 'MANA', 'cpmm-1'), ('m2', 'MANA', 'cpmm-1'), ('m3', 'MANA', 'cpmm-1'), ('cash1', 'CASH', 'cpmm-1');
    insert into leagues_season_end_times values (11, 'complete'), (12, 'active');
  `)
  const dir = path.resolve(__dirname, '../../supabase/migrations')
  await db.exec(
    fs.readFileSync(
      path.join(dir, '../achievement_materialized_views.sql'),
      'utf8'
    )
  )
  for (const file of MIGRATIONS) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8')
    // Single-connection PGlite can build the same partial index only offline.
    await db.exec(sql.replace('create index concurrently', 'create index'))
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
    delete from user_portfolio_history_latest;
    delete from trophy_rank_state;
    delete from user_reactions;
    delete from contract_comments;
    delete from old_post_comments;
    delete from old_posts;
    delete from user_stats;
    delete from user_contract_metrics;
    delete from answers;
    delete from contracts where creator_id is not null;
    delete from user_trophy_milestones;
    delete from user_trophy_rewards;
    delete from user_showcase;
    delete from user_bans;
    delete from txns;
    delete from contract_bets;
    delete from user_entitlements;
    delete from users;
    delete from leagues;
    refresh materialized view mv_ach_txns_achievements;
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
const claim = async (
  uid: string,
  trophyId: string,
  milestoneId: string,
  profileUserId = uid
) =>
  (await claimTrophy(
    { userId: profileUserId, trophyId, milestoneId },
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

  it('count split legs whose float amounts sum to just under M10', async () => {
    await addUser('u')
    await bet('u', 'm1', 4.999999999999993, 0)
    await bet('u', 'm1', 4.999999999999993, 0)
    expect((await trophiesOf('u')).starter?.starterTrades).toBe(1)
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
    const paidRefs = [
      { trophyId: 'starter-trades', milestoneId: 'first-trade' },
      { trophyId: 'starter-trades', milestoneId: 'hat-trick' },
    ]
    expect(first.rewarded).toEqual(expect.arrayContaining(paidRefs))
    expect((await trophiesOf('u')).rewarded).toEqual(
      expect.arrayContaining(paidRefs)
    )

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

  it("refuses a claim for another account's profile", async () => {
    await addUser('u')
    await addUser('other')
    await bet('u', 'm1', 10, 0)
    await expect(
      claim('u', 'starter-trades', 'first-trade', 'other')
    ).rejects.toMatchObject({ code: 403 })
    expect(await claimRows('u')).toHaveLength(0)
    expect(await claimRows('other')).toHaveLength(0)
    expect(await rewardTxns('u')).toHaveLength(0)
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

  it.each([
    ['basic', 'eligible'],
    ['premium', 'eligible'],
    ['premium', 'requires_verification'],
  ] as const)(
    'pays a %s member M50 once for First Trade (%s)',
    async (tier, bonusEligibility) => {
      await addUser('member', { data: { bonusEligibility } })
      await rows(
        `insert into user_entitlements (user_id, entitlement_id, expires_time, auto_renew)
       values ('member', $1, now() + interval '10 days', true)`,
        [`supporter-${tier}`]
      )
      await bet('member', 'm1', 10, 0)
      const firstTrade = () => claim('member', 'starter-trades', 'first-trade')
      expect((await firstTrade()).rewardAmount).toBe(50)
      expect((await firstTrade()).rewardAmount).toBe(0)
      expect((await balance('member')).balance).toBe(50)
      expect(await rewardTxns('member')).toMatchObject([
        {
          amount: 50,
          data: {
            data: { baseAmount: 50, effectiveTier: tier, multiplier: 1 },
          },
        },
      ])
    }
  )

  it('pays a bonus-blocked account M10 once for First Trade', async () => {
    await addUser('blocked', { data: { bonusEligibility: 'ineligible' } })
    await bet('blocked', 'm1', 10, 0)
    const firstTrade = () => claim('blocked', 'starter-trades', 'first-trade')
    expect((await firstTrade()).rewardAmount).toBe(10)
    expect((await firstTrade()).rewardAmount).toBe(0)
    expect((await balance('blocked')).balance).toBe(10)
    expect(await rewardTxns('blocked')).toMatchObject([
      {
        amount: 10,
        data: {
          data: { baseAmount: 50, effectiveTier: 'reduced', multiplier: 0.2 },
        },
      },
    ])
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

describe('Newcomer rewards', () => {
  beforeEach(() => {
    jest
      .mocked(loadUserAchievements)
      .mockResolvedValue({ accountAgeYears: 2 } as never)
  })

  it.each([false, true])(
    'pays M25 once for Newcomer (member %s)',
    async (member) => {
      await addUser('u')
      if (member) {
        await rows(
          `insert into user_entitlements (user_id, entitlement_id) values ('u', 'supporter-basic')`
        )
      }
      const paid = await claim('u', 'account-age', 'newcomer')
      expect(paid.rewardAmount).toBe(25)
      expect(paid.rewarded).toEqual([
        { trophyId: 'account-age', milestoneId: 'newcomer' },
      ])
      expect((await trophiesOf('u')).rewarded).toEqual(paid.rewarded)
      const again = await claim('u', 'account-age', 'newcomer')
      expect(again.newlyClaimed).toEqual([])
      expect(again.rewardAmount).toBe(0)
      expect(await rewardRows('u')).toHaveLength(1)
      expect(await rewardTxns('u')).toHaveLength(1)
      expect((await balance('u')).balance).toBe(25)
    }
  )

  it('collects an unpaid Newcomer reward once through a higher Account Age claim', async () => {
    await addUser('flagged', {
      data: { bonusEligibility: 'requires_verification' },
    })
    const unpaid = await claim('flagged', 'account-age', 'newcomer')
    expect(unpaid.newlyClaimed.map((c) => c.milestoneId)).toEqual(['newcomer'])
    expect(unpaid.rewardAmount).toBe(0)
    expect(await rewardRows('flagged')).toEqual([])
    expect(await rewardTxns('flagged')).toHaveLength(0)

    await rows(
      `update users set data = '{"bonusEligibility": "verified"}' where id = 'flagged'`
    )
    const paid = await claim('flagged', 'account-age', 'established')
    expect(paid.newlyClaimed.map((c) => c.milestoneId)).toEqual(['established'])
    expect(paid.rewardAmount).toBe(25)

    const retry = await claim('flagged', 'account-age', 'newcomer')
    expect(retry.rewardAmount).toBe(0)
    const txns = await rewardTxns('flagged')
    expect(txns).toHaveLength(1)
    expect(txns[0].amount).toBe(25)
    expect(await rewardRows('flagged')).toEqual([
      { milestone_id: 'newcomer', txn_id: txns[0].id },
    ])
    expect(await balance('flagged')).toEqual({
      balance: 25,
      total_deposits: 25,
    })
  })

  it.each(['newcomer', 'veteran'])(
    'records Newcomer without payment for an older account claiming %s',
    async (milestoneId) => {
      await addUser('old', { createdTime: START - 1 })
      const result = await claim('old', 'account-age', milestoneId)
      expect(result.newlyClaimed.map((c) => c.milestoneId)).toContain(
        'newcomer'
      )
      expect(result.rewardAmount).toBe(0)
      expect(await rewardRows('old')).toEqual([])
      expect(await rewardTxns('old')).toEqual([])
      expect((await balance('old')).balance).toBe(0)
    }
  )

  it('records Newcomer without payment for a starter bot', async () => {
    await addUser('bot')
    await rows(`update users set is_bot = true where id = 'bot'`)
    const result = await claim('bot', 'account-age', 'newcomer')
    expect(result.newlyClaimed).toHaveLength(1)
    expect(result.rewardAmount).toBe(0)
    expect(await rewardRows('bot')).toEqual([])
    expect(await rewardTxns('bot')).toEqual([])
  })
})

describe('other trophies', () => {
  it('claims Net Worth from a stored peak without a current snapshot or reward', async () => {
    await addUser('u')
    await rows("insert into user_net_worth_peaks values ('u', 20000, now())")
    const result = await claim('u', 'net-worth', 'goldfish')
    expect(result.newlyClaimed.map((c) => c.milestoneId)).toEqual([
      'minnow',
      'goldfish',
    ])
    expect(result.rewardAmount).toBe(0)
    expect(await rewardTxns('u')).toHaveLength(0)
  })
})

describe('showcase pins', () => {
  const pin = async (uid: string, pins: string[], profileUserId = uid) =>
    (await setShowcasePins(
      { userId: profileUserId, pins },
      { uid } as never,
      {} as never
    )) as APIResponse<'set-showcase-pins'>
  const savedPins = async (userId: string) =>
    (
      await rows(`select pins from user_showcase where user_id = $1`, [userId])
    )[0]?.pins

  it('saves pins of claimed trophies, and refuses others', async () => {
    await addUser('u')
    await bet('u', 'm1', 10, 0)
    await claim('u', 'starter-trades', 'first-trade')
    expect(await pin('u', ['trophy-starter-trades'])).toEqual({
      pins: ['trophy-starter-trades'],
    })
    expect(await savedPins('u')).toEqual(['trophy-starter-trades'])
    await expect(pin('u', ['trophy-starter-days'])).rejects.toMatchObject({
      code: 400,
    })
    expect(await savedPins('u')).toEqual(['trophy-starter-trades'])
  })

  it("returns the current season's league with the pins", async () => {
    await addUser('u')
    await addUser('newcomer')
    await rows(
      `insert into leagues (season, division, cohort, user_id) values
        (11, 4, 'c1', 'u'), (12, 2, 'c2', 'u'), (11, 3, 'c3', 'newcomer')`
    )
    expect((await trophiesOf('u')).league).toEqual({ season: 12, division: 2 })
    // A league last season only: none this season.
    expect((await trophiesOf('newcomer')).league).toBeNull()
    // The season the league was read for, even without one.
    expect((await trophiesOf('newcomer')).season).toBe(12)
  })

  it("refuses pins for another account's profile", async () => {
    await addUser('u')
    await addUser('other')
    await expect(pin('u', [], 'other')).rejects.toMatchObject({ code: 403 })
    expect(await savedPins('other')).toBeUndefined()
    expect(await savedPins('u')).toBeUndefined()
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

describe('nightly trophy ranks', () => {
  const { loadUserAchievements: loadLive } = jest.requireActual<
    typeof import('api/get-user-achievements')
  >('api/get-user-achievements')

  it('publishes an empty ranking when an active user has no portfolio snapshot', async () => {
    await addUser('u', { data: { lastBetTime: Date.now() - DAY } })
    await rows("update users set balance = 600000 where id = 'u'")
    expect(await loadLive('u')).toMatchObject({ netWorth: 0, peakNetWorth: 0 })
    expect((await trophiesOf('u')).ranksComputedTime).toBeNull()
    await updateTrophyRanks()
    expect(await rows('select * from trophy_ranks')).toEqual([])
    expect(await rows('select * from user_net_worth_peaks')).toEqual([])
    expect(Number.isFinite((await trophiesOf('u')).ranksComputedTime)).toBe(
      true
    )
  })

  it('keeps sale proceeds out of the previous portfolio snapshot', async () => {
    await addUser('seller', { data: { lastBetTime: Date.now() - DAY } })
    await db.exec(`
      update users set balance = 100000 where id = 'seller';
      insert into user_portfolio_history_latest (user_id, balance, investment_value, last_calculated)
        values ('seller', 100000, 300000, now() - interval '71 hours');
      update users set balance = balance + 300000 where id = 'seller';
    `)
    expect(await loadLive('seller')).toMatchObject({
      netWorth: 400000,
      peakNetWorth: 400000,
    })
    await updateTrophyRanks()
    expect(
      await rows('select peak_net_worth from user_net_worth_peaks')
    ).toEqual([{ peak_net_worth: 400000 }])
    expect((await trophiesOf('seller')).ranks).toEqual([])
  })

  it('reports an old snapshot without raising the stored peak or qualifying for a rank', async () => {
    await addUser('stale', { data: { lastBetTime: Date.now() - DAY } })
    await db.exec(`
      insert into user_portfolio_history_latest (user_id, balance, investment_value, last_calculated)
        values ('stale', 400000, 200000, now() - interval '73 hours');
      insert into user_net_worth_peaks values ('stale', 500000, now() - interval '4 days');
    `)
    expect(await loadLive('stale')).toMatchObject({
      netWorth: 600000,
      peakNetWorth: 500000,
    })
    await claim('stale', 'net-worth', 'whale')
    await updateTrophyRanks()
    expect(
      await rows('select peak_net_worth from user_net_worth_peaks')
    ).toEqual([{ peak_net_worth: 500000 }])
    expect((await trophiesOf('stale')).ranks).toEqual([])
  })

  it('keeps the peak verified by a Whale claim when the snapshot drops before the nightly run', async () => {
    await addUser('whale')
    await rows(`insert into user_portfolio_history_latest (user_id, balance, investment_value)
      values ('whale', 300000, 300000)`)
    const { newlyClaimed } = await claim('whale', 'net-worth', 'whale')
    expect(newlyClaimed.map((c) => c.milestoneId)).toContain('whale')
    await rows(`update user_portfolio_history_latest set investment_value = 20000
      where user_id = 'whale'`)
    expect(await loadLive('whale')).toMatchObject({
      netWorth: 320000,
      peakNetWorth: 600000,
    })
  })

  it('rolls back the peak when the snapshot falls short of the claimed tier', async () => {
    await addUser('u')
    await rows(`insert into user_portfolio_history_latest (user_id, balance, investment_value)
      values ('u', 320000, 0)`)
    await expect(claim('u', 'net-worth', 'whale')).rejects.toMatchObject({
      code: 403,
    })
    expect(await rows('select * from user_net_worth_peaks')).toEqual([])
    expect(await claimRows('u')).toEqual([])
  })

  it('uses whole mana for live stats, claims and nightly ranks at the Whale boundary', async () => {
    await addUser('u', { data: { lastBetTime: Date.now() - DAY } })
    // This exact numeric rounds up to 500000 if parsed as a JavaScript number.
    await rows(`insert into user_portfolio_history_latest (user_id, balance, investment_value)
      values ('u', 499999, 0.99999999999)`)
    expect(await loadLive('u')).toMatchObject({
      netWorth: 499999,
      peakNetWorth: 499999,
    })
    await expect(claim('u', 'net-worth', 'whale')).rejects.toMatchObject({
      code: 403,
    })
    await claim('u', 'net-worth', 'orca')
    expect(
      await rows('select peak_net_worth from user_net_worth_peaks')
    ).toEqual([{ peak_net_worth: 499999 }])
    await updateTrophyRanks()
    expect((await trophiesOf('u')).ranks).toEqual([])

    await rows(
      `update user_portfolio_history_latest set balance = 500000 where user_id = 'u'`
    )
    await updateTrophyRanks()
    expect((await trophiesOf('u')).ranks).toEqual([
      { trophyId: 'net-worth', rank: 1, value: 500000 },
    ])
    expect(
      await rows('select peak_net_worth from user_net_worth_peaks')
    ).toEqual([{ peak_net_worth: 500000 }])
    await claim('u', 'net-worth', 'whale')
  })

  it('floors an existing fractional peak before displaying it or granting a claim', async () => {
    await addUser('u')
    await rows(
      `insert into user_net_worth_peaks values ('u', 499999.99999999999, now())`
    )
    expect((await loadLive('u')).peakNetWorth).toBe(499999)
    await expect(claim('u', 'net-worth', 'whale')).rejects.toMatchObject({
      code: 403,
    })
  })

  it('counts a recent filled order but excludes both forms of redemption with a stale lastBetTime', async () => {
    for (const id of ['maker', 'redemption', 'auto-redemption'])
      await addUser(id, { data: { lastBetTime: Date.now() - 91 * DAY } })
    await db.exec(`
      insert into user_portfolio_history_latest (user_id, balance, investment_value)
        select id, 500000, 0 from users;
      insert into contract_bets (bet_id, user_id, contract_id, amount, created_time, is_filled, is_cancelled, is_redemption, data)
        values ('filled', 'maker', 'm1', 10, now() - interval '7 days', true, false, null, '{}'),
               ('redeem', 'redemption', 'm1', 10, now(), null, null, true, '{}'),
               ('auto', 'auto-redemption', 'm1', 10, now(), null, null, false, '{"isAutoRedemption":true}');
    `)
    await updateTrophyRanks()
    expect((await trophiesOf('maker')).ranks).toEqual([
      { trophyId: 'net-worth', rank: 1, value: 500000 },
    ])
    expect((await trophiesOf('redemption')).ranks).toEqual([])
    expect((await trophiesOf('auto-redemption')).ranks).toEqual([])
  })

  it('requires an executable limit order when the last trade was placed over 90 days ago', async () => {
    await db.exec(`
      insert into contracts (id, token, creator_id, mechanism, resolution, close_time, deleted) values
        ('resolved', 'MANA', 'creator', 'cpmm-1', 'YES', null, false),
        ('closed', 'MANA', 'creator', 'cpmm-1', null, now() - interval '1 day', false),
        ('deleted', 'MANA', 'creator', 'cpmm-1', null, null, true),
        ('poll', 'MANA', 'creator', 'none', null, null, false),
        ('multi', 'MANA', 'creator', 'cpmm-multi-1', null, now() + interval '1 day', false);
      insert into answers values ('done', 'multi', 'NO'), ('open', 'multi', null);
      insert into contract_bets
        (bet_id, user_id, contract_id, amount, created_time, is_filled, is_cancelled, answer_id, expires_at)
        select holder, holder, market, 0, now() - interval '91 days', false, false, answer_id, expires_at
        from (values
          ('resolved-market', 'resolved', null, null),
          ('closed-market', 'closed', null, null),
          ('deleted-market', 'deleted', null, null),
          ('poll-market', 'poll', null, null),
          ('paused-token', 'cash1', null, null),
          ('expired', 'm1', null, now() - interval '1 hour'),
          ('resolved-answer', 'multi', 'done', null),
          ('missing-answer', 'multi', 'missing', null),
          ('unfunded', 'm1', null, null),
          ('live-market', 'm1', null, null),
          ('live-answer', 'multi', 'open', now() + interval '1 hour')
        ) orders(holder, market, answer_id, expires_at);
      insert into users (id, balance, data)
        select user_id, case when user_id = 'unfunded' then 0 else 1 end,
          jsonb_build_object('lastBetTime', (extract(epoch from created_time) * 1000)::bigint)
        from contract_bets;
      insert into user_portfolio_history_latest (user_id, balance, investment_value)
        select id, 500000, 0 from users;
    `)
    await updateTrophyRanks()
    expect(
      await rows(
        "select user_id from trophy_ranks where trophy_id = 'net-worth' order by user_id"
      )
    ).toEqual([{ user_id: 'live-answer' }, { user_id: 'live-market' }])
  })

  it('retries the entire repeatable-read publication after a serialization failure or deadlock', async () => {
    const none = client.none
    const codes = ['40001', '40P01']
    const isolationLevels: string[] = []
    const writes = jest
      .spyOn(client, 'none')
      .mockImplementation(async (sql, params) => {
        if (sql.includes('insert into trophy_rank_state')) {
          const { transaction_isolation } = await client.one(
            'show transaction_isolation'
          )
          isolationLevels.push(transaction_isolation)
          const code = codes.shift()
          if (code)
            throw Object.assign(new Error('publication conflict'), { code })
        }
        return none(sql, params)
      })
    try {
      await updateTrophyRanks()
      expect(isolationLevels).toEqual([
        'repeatable read',
        'repeatable read',
        'repeatable read',
      ])
      expect(
        writes.mock.calls.filter(([sql]) =>
          sql.includes('delete from trophy_ranks')
        )
      ).toHaveLength(1)
      expect(await rows('select id from trophy_rank_state')).toEqual([
        { id: true },
      ])
    } finally {
      writes.mockRestore()
    }
  })

  it('agrees with the live achievement stats for every ranked trophy', async () => {
    await addUser('maker', {
      data: {
        lastBetTime: Date.now() - 91 * DAY,
        currentBettingStreak: 1001,
        creatorTraders: { allTime: 12001 },
      },
    })
    const bannedId = BANNED_TRADING_USER_IDS[0]
    await addUser(bannedId, {
      data: { referredByUserId: 'maker', creatorTraders: { allTime: 15000 } },
    })
    await addUser('liker', { data: { referredByUserId: 'maker' } })
    await addUser('invalid', { data: { lastBetTime: Date.now() - DAY } })
    await db.exec(`
      update users set balance = 1 where id in ('maker', 'liker');
      insert into user_portfolio_history_latest (user_id, balance, investment_value)
        values ('maker', 510000, 0), ('liker', 510000, 5000), ('invalid', 'NaN', 0);
      insert into user_net_worth_peaks values ('maker', 2000000, now() - interval '1 day');
      insert into contract_bets (bet_id, user_id, contract_id, amount, created_time, is_filled, is_cancelled)
      values ('open', 'maker', 'm1', 0, now(), false, false),
             ('ordinary', 'liker', 'm1', 10, now() - interval '91 days', null, null),
             ('filled', 'liker', 'm1', 10, now() - interval '91 days', true, false),
             ('cancelled', 'liker', 'm1', 0, now() - interval '91 days', false, true);

      insert into contracts (id, creator_id, token, mechanism, resolution, visibility, unique_bettor_count)
        select 'market-' || i, 'maker', 'MANA', 'cpmm-1', 'YES', 'public',
          case when i <= 250 then 10 else 9 end
        from generate_series(1, 2002) i;
      insert into contracts (id, creator_id, token, mechanism, visibility, unique_bettor_count)
        values ('poll', 'maker', 'MANA', 'none', 'public', 10),
               ('bounty', 'maker', 'MANA', 'none', 'public', 10);
      insert into contracts (id, creator_id, token, mechanism, resolution, visibility, unique_bettor_count, deleted)
        values ('deleted', 'maker', 'MANA', 'cpmm-1', 'YES', 'public', 10, true),
               ('break-even', 'maker', 'MANA', 'cpmm-1', 'YES', 'public', 1, false);
      insert into user_contract_metrics (user_id, contract_id, profit)
        select 'maker', id, case id when 'market-2001' then 'NaN'::numeric
          when 'market-2002' then 'Infinity'::numeric
          when 'break-even' then ((0.1::float8 + 0.2::float8) - 0.3::float8)::numeric
          else 1 end
        from contracts where resolution = 'YES';

      insert into contract_comments
        select 'comment-' || i, 'm1', 'maker', '{}'::jsonb from generate_series(1, 997) i;
      insert into contract_comments values
        ('deleted-comment', 'm1', 'maker', '{"deleted":true}'), ('hidden-comment', 'm1', 'maker', '{"hidden":true}'),
        ('other-market-comment', 'm1', 'other-author', '{}'),
        ('deleted-market-comment', 'deleted', 'maker', '{}'), ('missing-market-comment', 'missing', 'maker', '{}');
      insert into old_posts values ('post');
      insert into old_post_comments
        select 'post-comment-' || i, 'post', 'maker', '{}'::jsonb from generate_series(1, 3) i;
      insert into old_post_comments values
        ('hidden-post-comment', 'post', 'maker', '{"hidden":true}'), ('deleted-post-comment', 'post', 'maker', '{"deleted":true}'),
        ('other-post-comment', 'post', 'other-author', '{}'), ('missing-parent-comment', 'missing', 'maker', '{}');
      insert into user_reactions (content_owner_id, content_id, content_type, reaction_type, user_id)
        select 'maker', comment_id, 'comment', 'like', 'liker' from contract_comments
        union all
        select 'maker', comment_id, 'comment', 'like', 'liker' from old_post_comments
        union all
        select 'maker', 'orphan', 'comment', 'like', 'liker';
      insert into contract_comments values ('banned-like', 'm1', 'maker', '{}');

      insert into leagues (season, division, cohort, user_id)
        select i, 6, 'c1', 'maker' from generate_series(1, 8) i;
      refresh materialized view mv_ach_txns_achievements;
    `)
    await rows("insert into user_stats values ('liker', 10), ($1, 10)", [
      bannedId,
    ])
    await rows(
      "insert into user_reactions values ('maker', 'banned-like', 'comment', 'like', $1)",
      [bannedId]
    )
    await updateTrophyRanks()
    const live = await loadLive('maker')
    expect(live).toMatchObject({
      netWorth: 510000,
      peakNetWorth: 2000000,
      longestBettingStreak: 1001,
      creatorTraders: 12001,
      marketsCreatedWithTraders: 250,
      resolvedProfitableMarkets: 2000,
      profitableMarketsCount: 2004,
      likedComments: 1000,
      referredTraders: 1,
      leagueLevel: 11,
    })
    const { ranks } = await trophiesOf('maker')
    expect(ranks).toHaveLength(RANKED_TROPHY_DEFINITIONS.length)
    for (const def of RANKED_TROPHY_DEFINITIONS) {
      expect(ranks).toContainEqual({
        trophyId: def.id,
        rank: 1,
        value:
          def.id === 'net-worth'
            ? live.netWorth
            : getTrophyStatValue(def, live),
      })
    }
    expect((await trophiesOf('liker')).ranks).toEqual([])
    expect((await trophiesOf(bannedId)).ranks).toEqual([])
    expect(await loadLive('liker')).toMatchObject({
      netWorth: 515000,
      peakNetWorth: 515000,
    })
    expect((await trophiesOf('invalid')).ranks).toEqual([])
    expect((await loadLive('invalid')).netWorth).toBe(0)
    expect(
      await rows("select * from user_net_worth_peaks where user_id = 'invalid'")
    ).toEqual([])
  })

  it('replaces held ranks, preserving ties, best ranks and net worth peaks', async () => {
    const active = { data: { lastBetTime: Date.now() - DAY } }
    for (const id of ['a', 'b', 'house', 'bot', 'banned'])
      await addUser(id, active)
    await addUser('inactive', { data: { lastBetTime: Date.now() - 91 * DAY } })
    await addUser('deleted', { data: { ...active.data, userDeleted: true } })
    await db.exec(`
      insert into user_portfolio_history_latest (user_id, balance, investment_value)
        select id, 450000, 50000 from users;
      update users set is_bot = true where id = 'bot';
      insert into user_bans (user_id, ban_type) values ('banned', 'trading'), ('a', 'modAlert');
      insert into trophy_rank_exclusions (user_id, reason) values ('house', 'Organisation');
    `)
    await updateTrophyRanks()
    const first = await trophiesOf('a')
    expect(first.ranks).toEqual([
      { trophyId: 'net-worth', value: 500000, rank: 1 },
    ])
    expect(first.rankPeaks).toEqual([{ trophyId: 'net-worth', bestRank: 1 }])
    expect(Number.isFinite(first.ranksComputedTime)).toBe(true)
    expect(
      await rows('select user_id, rank from trophy_ranks order by user_id')
    ).toEqual([
      { user_id: 'a', rank: 1 },
      { user_id: 'b', rank: 1 },
    ])
    await db.exec(
      "update user_portfolio_history_latest set balance = 400000 where user_id = 'a'"
    )
    await updateTrophyRanks()
    const next = await trophiesOf('a')
    expect(next.ranks).toEqual([])
    expect(next.rankPeaks).toEqual(first.rankPeaks)
    expect(
      await rows(
        "select peak_net_worth from user_net_worth_peaks where user_id = 'a'"
      )
    ).toEqual([{ peak_net_worth: 500000 }])
    const bestTimes = await rows(
      "select first_ranked_time, best_rank_time from user_trophy_rank_peaks where user_id = 'b'"
    )
    expect(new Date(bestTimes[0].first_ranked_time).valueOf()).toBe(
      first.ranksComputedTime
    )
    expect(new Date(bestTimes[0].best_rank_time).valueOf()).toBe(
      first.ranksComputedTime
    )
  })
})
