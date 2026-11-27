// Trophy prizes: claiming a milestone pays its prize once. Mana and streak
// freezes are paid in the transaction that records the claim; free membership
// days are granted right after it, and retried until they land. The nightly
// rank job pays the Super and Mega title prizes the same way.
//
// Runs the claim, profile, membership grant and nightly rank SQL against
// in-memory PostgreSQL with the trophy and membership grant migrations and
// the achievement materialized views.
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
jest.mock('shared/supabase/init', () => {
  const pgp = jest.requireActual<typeof pgPromise>('pg-promise')()
  return {
    createSupabaseDirectClient: jest.fn(),
    pgp,
    SERIAL_MODE: {},
    READ_ONLY_REPEATABLE_MODE: new pgp.txMode.TransactionMode({
      tiLevel: pgp.txMode.isolationLevel.repeatableRead,
      readOnly: true,
    }),
  }
})
jest.mock('shared/supabase/users', () => ({ broadcastUserUpdates: jest.fn() }))
jest.mock('shared/websockets/helpers', () => ({
  broadcastUpdatedUser: jest.fn(),
}))
// The scheduler asks the API to broadcast; nothing to call here.
jest.mock('shared/relay-membership-broadcast', () => ({
  relayMembershipBroadcast: jest.fn(),
}))
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
import * as trophies from 'common/trophies'
import { RANKED_TROPHY_DEFINITIONS, getTrophyStatValue } from 'common/trophies'
import * as membershipGrants from 'shared/membership-grants'
import { relayMembershipBroadcast } from 'shared/relay-membership-broadcast'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { broadcastUserUpdates } from 'shared/supabase/users'
import { broadcastUpdatedUser } from 'shared/websockets/helpers'
import { settleTrophyPrizes } from 'scheduler/jobs/settle-trophy-prizes'
import { updateTrophyRanks } from 'scheduler/jobs/update-trophy-ranks'

const { loadUserAchievements: loadLive } = jest.requireActual<
  typeof import('api/get-user-achievements')
>('api/get-user-achievements')

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
  result: async (sql: string, params?: unknown) => ({
    rowCount: (await db.query(pgp.as.format(sql, params))).affectedRows,
  }),
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
  '2026112503_membership_grants.sql',
  '2026112801_trophy_prizes.sql',
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
    create table perp_orders (user_id text not null, created_time timestamptz not null);
    create table group_members (group_id text not null, member_id text not null);
    create table private_users (id text primary key, data jsonb not null);
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
  jest.mocked(createSupabaseDirectClient).mockReturnValue({
    ...client,
    task: (fn: (session: typeof client) => Promise<unknown>) => fn(client),
  } as unknown as ReturnType<typeof createSupabaseDirectClient>)
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
    delete from membership_grants;
    delete from membership_notice_deliveries;
    delete from user_showcase;
    delete from user_bans;
    delete from txns;
    delete from contract_bets;
    delete from perp_orders;
    delete from user_entitlements;
    delete from private_users;
    delete from users;
    delete from leagues;
    refresh materialized view mv_ach_txns_achievements;
  `)
  jest.mocked(broadcastUserUpdates).mockClear()
  jest.mocked(broadcastUpdatedUser).mockClear()
  jest.mocked(relayMembershipBroadcast).mockClear()
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

// As a signed-out visitor, unless a viewer is given.
const trophiesOf = async (userId: string, viewerId?: string) =>
  (await getUserTrophies(
    { userId },
    (viewerId ? { uid: viewerId } : undefined) as never,
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

// What each prize row recorded, by milestone (or rank title prize) id.
const prizeRows = async (uid: string, trophyId: string) =>
  Object.fromEntries(
    (
      await rows(
        `select milestone_id, mana, freezes, effective_tier as tier, membership_tier as m_tier,
           membership_days as days, membership_status as status,
           membership_outcome as outcome, membership_granted_ms as granted_ms
         from user_trophy_rewards where user_id = $1 and trophy_id = $2`,
        [uid, trophyId]
      )
    ).map(({ milestone_id, ...row }) => [milestone_id as string, row])
  )

const grantRows = async (uid: string) =>
  rows(
    `select tier, duration_ms, source, source_id, status
     from membership_grants where user_id = $1 order by id`,
    [uid]
  )

const freezesOf = async (uid: string) =>
  (
    await rows(
      `select (data->>'streakForgiveness')::int as freezes from users where id = $1`,
      [uid]
    )
  )[0].freezes

const pg = () =>
  createSupabaseDirectClient() as Parameters<
    typeof membershipGrants.grantMembershipDays
  >[0]

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
      ...trophies.EMPTY_STARTER_STATS,
      starterTrades: 3,
      starterMarkets: 2,
      starterDays: 2,
      starterSells: 1,
    })
  })

  it('add up a purchase split across answers', async () => {
    await addUser('u')
    await bet('u', 'm1', 5, 0)
    await bet('u', 'm1', 5, 0)
    expect((await trophiesOf('u')).starter).toEqual({
      ...trophies.EMPTY_STARTER_STATS,
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

  // get-user-trophies is public. Push settings and membership payments are
  // the owner's to see.
  it('show whether push is on and a membership was paid for to the owner only', async () => {
    await addUser('u')
    await addUser('visitor')
    await bet('u', 'm1', 10, 0)
    await db.exec(`
      insert into private_users (id, data) values ('u', '{"pushToken": "device"}');
      insert into txns (amount, category, from_id, from_type, to_id, to_type, token)
        values (500, 'MEMBERSHIP_PAYMENT', 'u', 'USER', 'BANK', 'BANK', 'M$');
    `)
    const own = (await trophiesOf('u', 'u')).starter
    expect(own).toMatchObject({
      starterTrades: 1,
      pushEnabled: 1,
      paidMembership: 1,
    })
    for (const viewer of ['visitor', undefined]) {
      // Everything public is the same; the two private counts read as zero.
      expect((await trophiesOf('u', viewer)).starter).toEqual({
        ...own,
        pushEnabled: 0,
        paidMembership: 0,
      })
    }

    // A claim is public, so what it shows is no longer hidden.
    await claim('u', 'starter-push', 'stay-in-the-loop')
    expect((await trophiesOf('u', 'visitor')).starter).toMatchObject({
      pushEnabled: 1,
      paidMembership: 0,
    })
    expect((await trophiesOf('u', 'u')).starter).toEqual(own)
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
    'pays M50 once for Newcomer (member %s)',
    async (member) => {
      await addUser('u')
      if (member) {
        await rows(
          `insert into user_entitlements (user_id, entitlement_id) values ('u', 'supporter-basic')`
        )
      }
      const paid = await claim('u', 'account-age', 'newcomer')
      expect(paid.rewardAmount).toBe(50)
      expect(paid.prize).toEqual({ mana: 50, freezes: 0, membership: [] })
      expect(paid.rewarded).toEqual([
        { trophyId: 'account-age', milestoneId: 'newcomer' },
      ])
      expect((await trophiesOf('u')).rewarded).toEqual(paid.rewarded)
      const again = await claim('u', 'account-age', 'newcomer')
      expect(again.newlyClaimed).toEqual([])
      expect(again.rewardAmount).toBe(0)
      expect(await rewardRows('u')).toHaveLength(1)
      expect(await rewardTxns('u')).toHaveLength(1)
      expect((await balance('u')).balance).toBe(50)
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
    expect(paid.newlyClaimed.map((c) => c.milestoneId)).toEqual([
      'settling-in',
      'committed',
      'half-year',
      'established',
    ])
    // Newcomer's M50. The rest of Account Age pays freezes and Plus days.
    expect(paid.rewardAmount).toBe(50)
    expect(paid.prize.freezes).toBe(4)

    const retry = await claim('flagged', 'account-age', 'newcomer')
    expect(retry.rewardAmount).toBe(0)
    expect(retry.prize).toEqual({ mana: 0, freezes: 0, membership: [] })
    const txns = await rewardTxns('flagged')
    expect(txns).toHaveLength(1)
    expect(txns[0].amount).toBe(50)
    expect(await rewardRows('flagged')).toEqual([
      { milestone_id: 'committed', txn_id: null },
      { milestone_id: 'established', txn_id: null },
      { milestone_id: 'half-year', txn_id: null },
      { milestone_id: 'newcomer', txn_id: txns[0].id },
      { milestone_id: 'settling-in', txn_id: null },
    ])
    expect(await balance('flagged')).toEqual({
      balance: 50,
      total_deposits: 50,
    })
    expect(await freezesOf('flagged')).toBe(4)
  })

  it.each(['newcomer', 'veteran'])(
    'pays an older account a freeze, never mana, for Newcomer when it claims %s',
    async (milestoneId) => {
      await addUser('old', { createdTime: START - 1 })
      const result = await claim('old', 'account-age', milestoneId)
      expect(result.newlyClaimed.map((c) => c.milestoneId)).toContain(
        'newcomer'
      )
      expect(result.rewardAmount).toBe(0)
      expect((await prizeRows('old', 'account-age')).newcomer).toMatchObject({
        mana: 0,
        freezes: 1,
        status: 'none',
      })
      // Account Age pays no mana at any tier.
      expect(await rewardTxns('old')).toEqual([])
      expect((await balance('old')).balance).toBe(0)
      expect(await freezesOf('old')).toBe(result.prize.freezes)
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
  it('refuses Networker for a legacy self-referral with ten trades', async () => {
    await addUser('u', { data: { referredByUserId: 'u' } })
    await rows("insert into user_stats values ('u', 10)")
    jest.mocked(loadUserAchievements).mockImplementationOnce(loadLive)
    await expect(claim('u', 'referrals', 'networker')).rejects.toMatchObject({
      code: 403,
    })
  })

  it('claims Close Call once a streak freeze has saved the streak', async () => {
    await addUser('u', { createdTime: START - 1 })
    expect((await loadLive('u')).streakFreezesUsed).toBe(0)
    jest.mocked(loadUserAchievements).mockImplementationOnce(loadLive)
    await expect(
      claim('u', 'streak-saves', 'close-call')
    ).rejects.toMatchObject({ code: 403 })

    await rows(
      `update users set data = data || '{"streakFreezesUsed": 2}' where id = 'u'`
    )
    expect((await loadLive('u')).streakFreezesUsed).toBe(2)
    jest.mocked(loadUserAchievements).mockImplementationOnce(loadLive)
    const { newlyClaimed } = await claim('u', 'streak-saves', 'close-call')
    expect(newlyClaimed.map((c) => c.milestoneId)).toEqual(['close-call'])
  })

  it('crosses Account Age thresholds on the UTC calendar anniversary', async () => {
    await addUser('u')
    // now() is fixed within a transaction. PostgreSQL interval addition
    // supplies the expected boundary, including for short months and leap days.
    await client.tx(async () => {
      for (const months of [1, 3, 6, 12, 18, 24, 36, 48, 60]) {
        for (const offset of [-1, 0, 1]) {
          const [signup] = await rows(
            `update users set created_time = (now() at time zone 'UTC'
               - make_interval(months => $1) + $2 * interval '1 millisecond') at time zone 'UTC'
             where id = 'u'
             returning (created_time at time zone 'UTC') + make_interval(months => $1)
               <= (now() at time zone 'UTC') as reached`,
            [months, offset]
          )
          const { accountAgeYears } = await loadLive('u')
          expect(accountAgeYears >= months / 12).toBe(signup.reached)
        }
      }
    })
  })

  it('refuses a Net Worth claim backed only by a stored peak', async () => {
    await addUser('u')
    await rows("insert into user_net_worth_peaks values ('u', 20000, now())")
    await expect(claim('u', 'net-worth', 'goldfish')).rejects.toMatchObject({
      code: 403,
    })
    expect(await claimRows('u')).toEqual([])
  })

  it('checks the latest snapshot on every claim and pays the Net Worth prize only once', async () => {
    await addUser('u')
    await rows(
      "insert into user_portfolio_history_latest (user_id, balance, investment_value) values ('u', 2499, 1)"
    )
    const first = await claim('u', 'net-worth', 'minnow')
    expect(first.newlyClaimed.map((c) => c.milestoneId)).toEqual(['minnow'])
    // Minnow is green: one streak freeze.
    expect(first.prize).toEqual({ mana: 0, freezes: 1, membership: [] })
    expect(await freezesOf('u')).toBe(1)
    await rows(
      "update user_portfolio_history_latest set investment_value = 0 where user_id = 'u'"
    )
    await expect(claim('u', 'net-worth', 'minnow')).rejects.toMatchObject({
      code: 403,
    })
    expect(await trophiesOf('u')).toMatchObject({
      claims: first.claims,
      storedPeakNetWorth: 2500,
    })
    await rows(
      "update user_portfolio_history_latest set investment_value = 1 where user_id = 'u'"
    )
    const retry = await claim('u', 'net-worth', 'minnow')
    expect(retry.newlyClaimed).toEqual([])
    expect(retry.prize).toEqual({ mana: 0, freezes: 0, membership: [] })
    expect(await freezesOf('u')).toBe(1)
    expect(Object.keys(await prizeRows('u', 'net-worth'))).toEqual(['minnow'])
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
  const publisherLocks = () =>
    rows(
      `select granted from pg_locks where locktype = 'advisory' and mode = 'ExclusiveLock'
       and objid = hashtext('update-trophy-ranks')::oid`
    )

  it('publishes an empty ranking when an active user has no portfolio snapshot', async () => {
    await addUser('u', { data: { lastBetTime: Date.now() - DAY } })
    await rows("update users set balance = 600000 where id = 'u'")
    expect(await loadLive('u')).toMatchObject({ netWorth: 0, peakNetWorth: 0 })
    expect(await trophiesOf('u')).toMatchObject({
      ranksComputedTime: null,
      storedPeakNetWorth: null,
    })
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
    expect(await trophiesOf('whale')).toMatchObject({
      ranks: [],
      storedPeakNetWorth: 600000,
    })
  })

  it('publishes the sampled rank and preserves a higher claim made before the nightly peak write', async () => {
    await addUser('u', { data: { lastBetTime: Date.now() - DAY + 0.5 } })
    await db.exec(`
      insert into user_net_worth_peaks values ('u', 400000, now());
      insert into user_portfolio_history_latest (user_id, balance, investment_value)
        values ('u', 510000, 0);
    `)
    // PGlite has one connection. Interleave the claim after the snapshot
    // closes and before publication begins, with the publisher lock still held.
    const tx = client.tx
    const publication = jest
      .spyOn(client, 'tx')
      .mockImplementationOnce(async (...args) => {
        expect(await publisherLocks()).toEqual([{ granted: true }])
        const result = await tx(...args)
        expect(await publisherLocks()).toEqual([{ granted: true }])
        expect(await trophiesOf('u')).toMatchObject({
          ranks: [],
          rankPeaks: [],
          ranksComputedTime: null,
          storedPeakNetWorth: 400000,
        })
        await rows(
          "update user_portfolio_history_latest set balance = 600000 where user_id = 'u'"
        )
        await claim('u', 'net-worth', 'whale')
        return result
      })
    try {
      await updateTrophyRanks()
      expect(await trophiesOf('u')).toMatchObject({
        ranks: [{ trophyId: 'net-worth', rank: 1, value: 510000 }],
        rankPeaks: [{ trophyId: 'net-worth', bestRank: 1 }],
        ranksComputedTime: expect.any(Number),
        storedPeakNetWorth: 600000,
      })
      expect(await publisherLocks()).toEqual([])
    } finally {
      publication.mockRestore()
    }
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

  it('floors a fractional peak for history and refuses a claim without a snapshot', async () => {
    await addUser('u')
    await rows(
      `insert into user_net_worth_peaks values ('u', 499999.99999999999, now())`
    )
    expect((await loadLive('u')).peakNetWorth).toBe(499999)
    expect((await trophiesOf('u')).storedPeakNetWorth).toBe(499999)
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

  it('counts perpetuals orders placed in the last 90 days with a stale lastBetTime', async () => {
    for (const id of ['recent', 'old', 'future'])
      await addUser(id, { data: { lastBetTime: Date.now() - 91 * DAY } })
    await db.exec(`
      insert into user_portfolio_history_latest (user_id, balance, investment_value)
        select id, 500000, 0 from users;
      insert into perp_orders (user_id, created_time) values
        ('recent', now() - interval '89 days'),
        ('old', now() - interval '91 days'),
        ('future', now() + interval '1 day');
    `)
    await updateTrophyRanks()
    expect(
      await rows(
        "select user_id from trophy_ranks where trophy_id = 'net-worth'"
      )
    ).toEqual([{ user_id: 'recent' }])
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

  it('rolls back the sampled peaks and ranks together when publication fails', async () => {
    await addUser('u', { data: { lastBetTime: Date.now() - DAY } })
    await db.exec(`
      insert into user_portfolio_history_latest (user_id, balance, investment_value)
        values ('u', 510000, 0);
      alter table trophy_rank_state add constraint reject_publication check (false);
    `)
    try {
      await expect(updateTrophyRanks()).rejects.toMatchObject({ code: '23514' })
      expect(await trophiesOf('u')).toMatchObject({
        ranks: [],
        rankPeaks: [],
        ranksComputedTime: null,
        storedPeakNetWorth: null,
      })
      expect(await publisherLocks()).toEqual([])
    } finally {
      await db.exec(
        'alter table trophy_rank_state drop constraint reject_publication'
      )
    }
  })

  it('retries only the write transaction after a serialization failure or deadlock', async () => {
    const none = client.none
    const codes = ['40001', '40P01']
    const transactions = jest.spyOn(client, 'tx')
    const writes = jest
      .spyOn(client, 'none')
      .mockImplementation(async (sql, params) => {
        if (sql.includes('insert into trophy_rank_state')) {
          expect(await publisherLocks()).toEqual([{ granted: true }])
          const code = codes.shift()
          if (code)
            throw Object.assign(new Error('publication conflict'), { code })
        }
        return none(sql, params)
      })
    try {
      await updateTrophyRanks()
      expect(
        transactions.mock.calls.map(([options]) =>
          (options as { mode: { begin(): string } }).mode.begin()
        )
      ).toEqual([
        'begin isolation level repeatable read read only',
        'begin isolation level read committed read write',
        'begin isolation level read committed read write',
        'begin isolation level read committed read write',
      ])
      expect(
        writes.mock.calls.filter(([sql]) =>
          sql.includes('delete from trophy_ranks')
        )
      ).toHaveLength(3)
      expect(await rows('select id from trophy_rank_state')).toEqual([
        { id: true },
      ])
    } finally {
      writes.mockRestore()
      transactions.mockRestore()
    }
  })

  it('counts Silver and higher divisions in live League levels', async () => {
    await addUser('u')
    for (const [division, level] of [
      [1, 0],
      [2, 1],
      [3, 2],
      [4, 3],
      [5, 4],
      [6, 5],
    ]) {
      await rows(
        "insert into leagues (season, division, cohort, user_id) values ($1, $1, 'c', 'u')",
        [division]
      )
      expect((await loadLive('u')).leagueLevel).toBe(level)
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
    await addUser('second-liker')
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
      insert into user_reactions values
        ('maker', 'comment-1', 'comment', 'like', 'second-liker'),
        ('maker', 'banned-like', 'comment', 'like', 'maker');

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
      leagueLevel: 12,
    })
    const { ranks } = await trophiesOf('maker')
    expect(ranks).toHaveLength(RANKED_TROPHY_DEFINITIONS.length)
    for (const def of RANKED_TROPHY_DEFINITIONS) {
      expect(ranks).toContainEqual({
        trophyId: def.id,
        rank: 1,
        value: getTrophyStatValue(def, live),
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

describe('trophy prizes', () => {
  const NOTHING = { mana: 0, freezes: 0, membership: [] }
  // Created before the starter cutoff: an existing account.
  const addOldUser = (id: string, data: object = {}) =>
    addUser(id, { createdTime: START - 1, data })
  const withTrades = (totalTradesCount: number) =>
    jest
      .mocked(loadUserAchievements)
      .mockResolvedValue({ totalTradesCount, accountAgeYears: 0 } as never)
  const setEligibility = (uid: string, bonusEligibility: string) =>
    rows(
      `update users set data = data || jsonb_build_object('bonusEligibility', $2::text) where id = $1`,
      [uid, bonusEligibility]
    )
  // Trades Placed, up to Enthusiast: green and teal pay a freeze each, blue a
  // freeze and a day of Plus, indigo M50 and two days of Plus.
  const enthusiast = (uid: string) => claim(uid, 'total-trades', 'enthusiast')
  const allFour = ['rookie', 'dabbler', 'regular', 'enthusiast'].map(
    (milestoneId) => ({ trophyId: 'total-trades', milestoneId })
  )

  beforeEach(() => {
    withTrades(250)
  })

  it('pays an existing account mana, freezes and membership days, once', async () => {
    await addOldUser('old')
    const result = await enthusiast('old')
    expect(result.newlyClaimed.map((c) => c.milestoneId)).toEqual(
      allFour.map((r) => r.milestoneId)
    )
    expect(result.rewardAmount).toBe(50)
    // The two-day grant goes first and starts; the other waits behind it.
    expect(result.prize).toEqual({
      mana: 50,
      freezes: 3,
      membership: [
        { tier: 'basic', days: 1, grantedDays: 1, outcome: 'banked' },
        { tier: 'basic', days: 2, grantedDays: 2, outcome: 'started' },
      ],
    })
    expect(await balance('old')).toEqual({ balance: 50, total_deposits: 50 })
    expect(await freezesOf('old')).toBe(3)

    const [txn] = await rewardTxns('old')
    expect(txn).toMatchObject({ amount: 50, from_type: 'BANK', token: 'M$' })
    expect(txn.data.data).toEqual({
      trophyId: 'total-trades',
      milestoneIds: ['enthusiast'],
      baseAmount: 50,
      effectiveTier: 'free',
      multiplier: 1,
      freezes: 3,
      membership: [
        { milestoneId: 'regular', tier: 'basic', days: 1 },
        { milestoneId: 'enthusiast', tier: 'basic', days: 2 },
      ],
    })
    const none = { m_tier: null, days: null, status: 'none', outcome: null }
    expect(await prizeRows('old', 'total-trades')).toEqual({
      rookie: { mana: 0, freezes: 1, tier: 'free', ...none, granted_ms: null },
      dabbler: { mana: 0, freezes: 1, tier: 'free', ...none, granted_ms: null },
      regular: {
        mana: 0,
        freezes: 1,
        tier: 'free',
        m_tier: 'basic',
        days: 1,
        status: 'granted',
        outcome: 'banked',
        granted_ms: DAY,
      },
      enthusiast: {
        mana: 50,
        freezes: 0,
        tier: 'free',
        m_tier: 'basic',
        days: 2,
        status: 'granted',
        outcome: 'started',
        granted_ms: 2 * DAY,
      },
    })
    expect(await rewardRows('old')).toEqual([
      { milestone_id: 'dabbler', txn_id: null },
      { milestone_id: 'enthusiast', txn_id: txn.id },
      { milestone_id: 'regular', txn_id: null },
      { milestone_id: 'rookie', txn_id: null },
    ])
    expect(await grantRows('old')).toEqual([
      {
        tier: 'basic',
        duration_ms: 2 * DAY,
        source: 'trophy',
        source_id: 'total-trades/enthusiast',
        status: 'active',
      },
      {
        tier: 'basic',
        duration_ms: DAY,
        source: 'trophy',
        source_id: 'total-trades/regular',
        status: 'banked',
      },
    ])
    // The free days own the supporter row while they run.
    expect(
      await rows(
        `select entitlement_id, metadata->>'membershipGrantId' is not null as free
         from user_entitlements where user_id = 'old'`
      )
    ).toEqual([{ entitlement_id: 'supporter-basic', free: true }])

    // Balance and freezes are announced once the payout has committed.
    expect(broadcastUserUpdates).toHaveBeenCalledTimes(1)
    expect(broadcastUpdatedUser).toHaveBeenCalledWith({
      id: 'old',
      streakForgiveness: 3,
    })
    // Paid milestones are reported for every account, not only new ones.
    expect(result.rewarded).toEqual(expect.arrayContaining(allFour))
    expect(result.rewarded).toHaveLength(4)
    expect((await trophiesOf('old')).rewarded).toEqual(
      expect.arrayContaining(allFour)
    )

    // Claiming again, now as a member on free days, pays nothing more.
    const again = await enthusiast('old')
    expect(again.newlyClaimed).toEqual([])
    expect(again.rewardAmount).toBe(0)
    expect(again.prize).toEqual(NOTHING)
    expect(await balance('old')).toEqual({ balance: 50, total_deposits: 50 })
    expect(await freezesOf('old')).toBe(3)
    expect(await rewardTxns('old')).toHaveLength(1)
    expect(await grantRows('old')).toHaveLength(2)
  })

  it('pays only the milestones above those already paid', async () => {
    await addOldUser('old')
    withTrades(25)
    expect((await claim('old', 'total-trades', 'dabbler')).prize).toEqual({
      mana: 0,
      freezes: 2,
      membership: [],
    })
    withTrades(250)
    expect((await enthusiast('old')).prize).toEqual({
      mana: 50,
      freezes: 1,
      membership: [
        { tier: 'basic', days: 1, grantedDays: 1, outcome: 'banked' },
        { tier: 'basic', days: 2, grantedDays: 2, outcome: 'started' },
      ],
    })
    expect(await freezesOf('old')).toBe(3)
    expect((await balance('old')).balance).toBe(50)
  })

  // Two tabs claiming at once: the second transaction waits for the user's
  // row, then finds the first one's reward rows and pays only what is left.
  it('pays nothing for a milestone another claim has already recorded', async () => {
    await addOldUser('old')
    await rows(
      `insert into user_trophy_rewards (user_id, trophy_id, milestone_id, mana, freezes)
       values ('old', 'total-trades', 'rookie', 0, 1), ('old', 'total-trades', 'enthusiast', 50, 0)`
    )
    const result = await enthusiast('old')
    expect(result.newlyClaimed).toHaveLength(4)
    expect(result.prize).toEqual({
      mana: 0,
      freezes: 2,
      membership: [
        { tier: 'basic', days: 1, grantedDays: 1, outcome: 'started' },
      ],
    })
    expect(await freezesOf('old')).toBe(2)
    expect((await balance('old')).balance).toBe(0)
    expect(await rewardTxns('old')).toEqual([])
    expect(await grantRows('old')).toHaveLength(1)
  })

  it('adds freezes above the limit the shop sells up to', async () => {
    await addOldUser('old', { streakForgiveness: 10 })
    expect((await enthusiast('old')).prize.freezes).toBe(3)
    expect(await freezesOf('old')).toBe(13)
    expect(broadcastUpdatedUser).toHaveBeenCalledWith({
      id: 'old',
      streakForgiveness: 13,
    })
  })

  it('pays a bonus-blocked account a fifth of the mana, the freezes and no membership days', async () => {
    await addOldUser('blocked', { bonusEligibility: 'ineligible' })
    const result = await enthusiast('blocked')
    expect(result.prize).toEqual({ mana: 10, freezes: 3, membership: [] })
    expect(await balance('blocked')).toEqual({
      balance: 10,
      total_deposits: 10,
    })
    expect(await freezesOf('blocked')).toBe(3)
    expect((await rewardTxns('blocked'))[0].data.data).toMatchObject({
      baseAmount: 50,
      effectiveTier: 'reduced',
      multiplier: 0.2,
      membership: [],
    })
    expect(await prizeRows('blocked', 'total-trades')).toMatchObject({
      regular: { freezes: 1, tier: 'reduced', status: 'none', m_tier: null },
      enthusiast: { mana: 10, tier: 'reduced', status: 'none', m_tier: null },
    })
    expect(await grantRows('blocked')).toEqual([])
    expect(
      await rows(`select * from user_entitlements where user_id = 'blocked'`)
    ).toEqual([])

    // Each milestone pays once: better standing later doesn't pay it again.
    await setEligibility('blocked', 'verified')
    expect((await enthusiast('blocked')).prize).toEqual(NOTHING)
    expect((await balance('blocked')).balance).toBe(10)
    expect(await grantRows('blocked')).toEqual([])
  })

  it('leaves a flagged account unpaid, and pays the whole prize once it is unflagged', async () => {
    await addOldUser('flagged', { bonusEligibility: 'requires_verification' })
    const unpaid = await enthusiast('flagged')
    expect(unpaid.newlyClaimed).toHaveLength(4)
    expect(unpaid.prize).toEqual(NOTHING)
    expect(unpaid.rewarded).toEqual([])
    expect(await prizeRows('flagged', 'total-trades')).toEqual({})
    expect(await freezesOf('flagged')).toBeNull()
    expect(await grantRows('flagged')).toEqual([])

    await setEligibility('flagged', 'verified')
    const paid = await enthusiast('flagged')
    expect(paid.newlyClaimed).toEqual([])
    expect(paid.prize).toMatchObject({ mana: 50, freezes: 3 })
    expect(paid.prize.membership).toHaveLength(2)
    expect(paid.rewarded).toHaveLength(4)
    expect((await balance('flagged')).balance).toBe(50)
  })

  // Prizes pay free membership days. Those must not lift a flag, or a flagged
  // account holding some would collect in full and keep itself topped up.
  describe('free membership days and standing', () => {
    const gift = (uid: string, tier: 'basic' | 'premium') =>
      membershipGrants.grantMembershipDays(pg(), {
        userId: uid,
        tier,
        durationMs: 5 * DAY,
        source: 'admin',
        sourceId: 'gift',
      })

    it('pay a flagged account holding only free days nothing', async () => {
      await addOldUser('flagged', {
        bonusEligibility: 'requires_verification',
      })
      await gift('flagged', 'basic')
      const result = await enthusiast('flagged')
      expect(result.newlyClaimed).toHaveLength(4)
      expect(result.prize).toEqual(NOTHING)
      expect(await prizeRows('flagged', 'total-trades')).toEqual({})
      expect(await grantRows('flagged')).toHaveLength(1)
      expect((await balance('flagged')).balance).toBe(0)
    })

    it('pay a bonus-blocked account holding only free days its reduced prize', async () => {
      await addOldUser('blocked', { bonusEligibility: 'ineligible' })
      await gift('blocked', 'basic')
      expect((await enthusiast('blocked')).prize).toEqual({
        mana: 10,
        freezes: 3,
        membership: [],
      })
      expect((await rewardTxns('blocked'))[0].data.data).toMatchObject({
        effectiveTier: 'reduced',
        multiplier: 0.2,
      })
      expect(await grantRows('blocked')).toHaveLength(1)
    })

    it('pay a flagged account in full while it pays for a membership, even one set aside', async () => {
      await addOldUser('member', { bonusEligibility: 'requires_verification' })
      await rows(
        `insert into user_entitlements (user_id, entitlement_id, expires_time)
         values ('member', 'supporter-basic', now() + interval '10 days')`
      )
      // Free Premium days take over the supporter row; paid Plus waits.
      await gift('member', 'premium')
      const result = await enthusiast('member')
      expect(result.prize).toMatchObject({ mana: 50, freezes: 3 })
      expect(result.prize.membership).toHaveLength(2)
      expect((await rewardTxns('member'))[0].data.data).toMatchObject({
        effectiveTier: 'premium',
        multiplier: 1,
      })
    })

    it('pay an unflagged account holding free days in full', async () => {
      await addOldUser('old')
      await gift('old', 'basic')
      expect((await enthusiast('old')).prize).toMatchObject({
        mana: 50,
        freezes: 3,
      })
    })
  })

  it('leaves a milestone that pays only membership days unpaid for a bonus-blocked account', async () => {
    await addUser('u', { data: { bonusEligibility: 'ineligible' } })
    // 25 market-days: In the Groove, which pays three days of Pro.
    for (let day = 0; day < 25; day++) await bet('u', 'm1', 10, day)
    const first = await claim('u', 'starter-trades', 'in-the-groove')
    expect(first.newlyClaimed.map((c) => c.milestoneId)).toContain(
      'in-the-groove'
    )
    expect(first.prize.membership).toEqual([])
    const paidBefore = await prizeRows('u', 'starter-trades')
    expect(paidBefore['first-trade']).toMatchObject({ mana: 10 })
    expect(paidBefore['in-the-groove']).toBeUndefined()
    expect(first.rewarded.map((r) => r.milestoneId)).not.toContain(
      'in-the-groove'
    )
    const txns = (await rewardTxns('u')).length

    await setEligibility('u', 'verified')
    const later = await claim('u', 'starter-trades', 'in-the-groove')
    expect(later.newlyClaimed).toEqual([])
    expect(later.prize).toEqual({
      mana: 0,
      freezes: 0,
      membership: [
        { tier: 'plus', days: 3, grantedDays: 3, outcome: 'started' },
      ],
    })
    expect(later.rewardAmount).toBe(0)
    expect(await rewardTxns('u')).toHaveLength(txns)
    expect(
      (await prizeRows('u', 'starter-trades'))['in-the-groove']
    ).toMatchObject({ mana: 0, m_tier: 'plus', days: 3, outcome: 'started' })
    expect(await grantRows('u')).toEqual([
      {
        tier: 'plus',
        duration_ms: 3 * DAY,
        source: 'trophy',
        source_id: 'starter-trades/in-the-groove',
        status: 'active',
      },
    ])
  })

  it('pays a bot nothing', async () => {
    await addOldUser('bot')
    await rows(`update users set is_bot = true where id = 'bot'`)
    const result = await enthusiast('bot')
    expect(result.newlyClaimed).toHaveLength(4)
    expect(result.prize).toEqual(NOTHING)
    expect(await prizeRows('bot', 'total-trades')).toEqual({})
    expect(await grantRows('bot')).toEqual([])
  })

  // These accounts were banned from trading before user_bans existed and
  // have no ban row.
  it('pays an account on the old trading ban list nothing, like a bot', async () => {
    const banned = BANNED_TRADING_USER_IDS[0]
    await addOldUser(banned)
    expect(await rows(`select 1 from user_bans`)).toEqual([])
    const result = await enthusiast(banned)
    // The claim is still recorded.
    expect(result.newlyClaimed).toHaveLength(4)
    expect(result.prize).toEqual(NOTHING)
    expect(result.rewarded).toEqual([])
    expect(await prizeRows(banned, 'total-trades')).toEqual({})
    expect(await rewardTxns(banned)).toEqual([])
    expect(await balance(banned)).toEqual({ balance: 0, total_deposits: 0 })
    expect(await freezesOf(banned)).toBeNull()
    expect(await grantRows(banned)).toEqual([])
    // Nor on a second try.
    expect((await enthusiast(banned)).prize).toEqual(NOTHING)
  })

  // Someone who claimed before prizes existed sees Collect on the milestone.
  // The stat it was claimed on may have dropped since.
  describe('collecting on a milestone claimed earlier', () => {
    it('pays without checking the stat again', async () => {
      await addOldUser('old', { bonusEligibility: 'requires_verification' })
      // Claimed, and left unpaid.
      expect((await enthusiast('old')).prize).toEqual(NOTHING)
      await setEligibility('old', 'verified')
      // Since then the count has dropped, say with deleted markets.
      withTrades(0)
      const checks = jest.mocked(loadUserAchievements).mock.calls.length

      const paid = await enthusiast('old')
      expect(paid.newlyClaimed).toEqual([])
      expect(paid.prize).toMatchObject({ mana: 50, freezes: 3 })
      expect(paid.prize.membership).toHaveLength(2)
      expect(paid.rewarded).toHaveLength(4)
      expect((await balance('old')).balance).toBe(50)
      expect(jest.mocked(loadUserAchievements).mock.calls).toHaveLength(checks)
      // Once.
      expect((await enthusiast('old')).prize).toEqual(NOTHING)
      expect((await balance('old')).balance).toBe(50)
    })

    it('still checks the stat for a milestone not claimed yet', async () => {
      await addOldUser('old')
      withTrades(25)
      await claim('old', 'total-trades', 'dabbler')
      withTrades(0)
      await expect(
        claim('old', 'total-trades', 'regular')
      ).rejects.toMatchObject({ code: 403 })
      expect(
        (await claimRows('old')).map((c) => c.milestone_id).sort()
      ).toEqual(['dabbler', 'rookie'])
      expect(
        Object.keys(await prizeRows('old', 'total-trades')).sort()
      ).toEqual(['dabbler', 'rookie'])
    })

    it('pays only the claimed milestones at or below it, never an unclaimed one', async () => {
      await addOldUser('old')
      // Claims from before prizes, with a gap where Dabbler joined the ladder.
      await rows(
        `insert into user_trophy_milestones (user_id, trophy_id, milestone_id)
         values ('old', 'total-trades', 'rookie'), ('old', 'total-trades', 'regular'),
           ('old', 'total-trades', 'enthusiast')`
      )
      withTrades(0)
      const result = await claim('old', 'total-trades', 'regular')
      expect(result.newlyClaimed).toEqual([])
      // Rookie's freeze and Regular's freeze and day of Plus. Not Dabbler,
      // which was never claimed, nor Enthusiast, which is above.
      expect(result.prize).toEqual({
        mana: 0,
        freezes: 2,
        membership: [
          { tier: 'basic', days: 1, grantedDays: 1, outcome: 'started' },
        ],
      })
      expect(
        Object.keys(await prizeRows('old', 'total-trades')).sort()
      ).toEqual(['regular', 'rookie'])
      expect(
        (await claimRows('old')).map((c) => c.milestone_id).sort()
      ).toEqual(['enthusiast', 'regular', 'rookie'])
      // Dabbler needs a claim of its own, and the stat to back it.
      await expect(
        claim('old', 'total-trades', 'dabbler')
      ).rejects.toMatchObject({ code: 403 })
    })

    it('refuses if the claim was removed while the request was on its way', async () => {
      await addOldUser('old', { bonusEligibility: 'requires_verification' })
      await enthusiast('old')
      await setEligibility('old', 'verified')
      withTrades(0)
      // An admin unclaims between the first read and the user's row lock.
      const real = createSupabaseDirectClient()
      jest.mocked(createSupabaseDirectClient).mockReturnValueOnce({
        ...real,
        tx: async (...args: unknown[]) => {
          await rows(`delete from user_trophy_milestones where user_id = 'old'`)
          return (real.tx as (...a: unknown[]) => Promise<unknown>)(...args)
        },
      } as never)
      await expect(enthusiast('old')).rejects.toMatchObject({ code: 409 })
      expect(await claimRows('old')).toEqual([])
      expect(await prizeRows('old', 'total-trades')).toEqual({})
      expect((await balance('old')).balance).toBe(0)
    })

    it('keeps the current-value check for Net Worth', async () => {
      await addOldUser('old', { bonusEligibility: 'requires_verification' })
      await rows(
        `insert into user_portfolio_history_latest (user_id, balance, investment_value) values ('old', 2500, 0)`
      )
      expect(
        (await claim('old', 'net-worth', 'minnow')).newlyClaimed
      ).toHaveLength(1)
      await setEligibility('old', 'verified')
      await rows(
        `update user_portfolio_history_latest set balance = 2499 where user_id = 'old'`
      )
      await expect(claim('old', 'net-worth', 'minnow')).rejects.toMatchObject({
        code: 403,
      })
      expect(await prizeRows('old', 'net-worth')).toEqual({})
      // Back at the tier, the prize can be collected.
      await rows(
        `update user_portfolio_history_latest set balance = 2500 where user_id = 'old'`
      )
      expect((await claim('old', 'net-worth', 'minnow')).prize).toEqual({
        mana: 0,
        freezes: 1,
        membership: [],
      })
    })
  })

  // Stay in the Loop replaces the push notification bonus older accounts got.
  describe('Stay in the Loop', () => {
    const stayInTheLoop = (uid: string) =>
      claim(uid, 'starter-push', 'stay-in-the-loop')
    const oldPushBonus = (uid: string) =>
      rows(
        `insert into txns (amount, category, from_id, from_type, to_id, to_type, token)
         values (1000, 'PUSH_NOTIFICATION_BONUS', 'BANK', 'BANK', $1, 'USER', 'M$')`,
        [uid]
      )
    const pushOn = (uid: string) =>
      rows(
        `insert into private_users (id, data) values ($1, '{"pushToken": "device"}')`,
        [uid]
      )

    it('pays M500 and a freeze for turning push on', async () => {
      await addUser('u')
      await pushOn('u')
      expect((await stayInTheLoop('u')).prize).toEqual({
        mana: 500,
        freezes: 1,
        membership: [],
      })
      expect((await balance('u')).balance).toBe(500)
    })

    it('pays the freeze but no mana to an account already paid the old push bonus', async () => {
      await addUser('u')
      await oldPushBonus('u')
      const result = await stayInTheLoop('u')
      expect(result.newlyClaimed).toHaveLength(1)
      expect(result.rewardAmount).toBe(0)
      expect(result.prize).toEqual({ mana: 0, freezes: 1, membership: [] })
      expect(await rewardTxns('u')).toEqual([])
      expect(await balance('u')).toEqual({ balance: 0, total_deposits: 0 })
      expect(await freezesOf('u')).toBe(1)
      // Recorded as paid, so the mana can't be collected later either: not
      // with push on as well, and not on another try.
      expect(await prizeRows('u', 'starter-push')).toMatchObject({
        'stay-in-the-loop': { mana: 0, freezes: 1, status: 'none' },
      })
      await pushOn('u')
      expect((await stayInTheLoop('u')).prize).toEqual(NOTHING)
      expect((await balance('u')).balance).toBe(0)
      expect(await freezesOf('u')).toBe(1)
    })

    it('holds the mana back however late the account collects', async () => {
      // Claimed while flagged, so nothing was paid or recorded.
      await addUser('u', {
        data: { bonusEligibility: 'requires_verification' },
      })
      await oldPushBonus('u')
      expect((await stayInTheLoop('u')).prize).toEqual(NOTHING)
      expect(await prizeRows('u', 'starter-push')).toEqual({})
      await setEligibility('u', 'verified')
      expect((await stayInTheLoop('u')).prize).toEqual({
        mana: 0,
        freezes: 1,
        membership: [],
      })
      expect((await balance('u')).balance).toBe(0)
    })

    it('leaves every other prize of that account alone', async () => {
      await addUser('u')
      await addUser('other')
      await oldPushBonus('u')
      await pushOn('other')
      await bet('u', 'm1', 10, 0)
      expect(
        (await claim('u', 'starter-trades', 'first-trade')).prize.mana
      ).toBe(50)
      // Someone else's old bonus changes nothing for this account.
      expect((await stayInTheLoop('other')).prize.mana).toBe(500)
    })
  })

  it('rolls back the claim, mana and freezes together when the payout fails', async () => {
    await addOldUser('old')
    await rows(
      `alter table users add constraint no_freezes check (coalesce((data->>'streakForgiveness')::int, 0) = 0)`
    )
    try {
      await expect(enthusiast('old')).rejects.toThrow()
      expect(await claimRows('old')).toEqual([])
      expect(await prizeRows('old', 'total-trades')).toEqual({})
      expect(await rewardTxns('old')).toEqual([])
      expect((await balance('old')).balance).toBe(0)
      expect(await grantRows('old')).toEqual([])
      expect(broadcastUserUpdates).not.toHaveBeenCalled()
      expect(broadcastUpdatedUser).not.toHaveBeenCalled()
    } finally {
      await rows(`alter table users drop constraint no_freezes`)
    }
    expect((await enthusiast('old')).prize).toMatchObject({
      mana: 50,
      freezes: 3,
    })
  })

  describe('membership days', () => {
    const regular = (uid: string) => claim(uid, 'total-trades', 'regular')
    const pending = {
      tier: 'basic',
      days: 1,
      grantedDays: 0,
      outcome: 'pending',
    }
    const started = {
      tier: 'basic',
      days: 1,
      grantedDays: 1,
      outcome: 'started',
    }
    let grantSpy: jest.SpyInstance | undefined
    const failGrantOnce = () =>
      (grantSpy = jest
        .spyOn(membershipGrants, 'grantMembershipDays')
        .mockRejectedValueOnce(new Error('Bet queue full')))
    // Old enough for the sweep, and past any wait a failed pass set.
    const ageRewards = (uid: string) =>
      rows(
        `update user_trophy_rewards set created_time = now() - interval '2 minutes',
           membership_next_attempt_time = now() - interval '1 second'
         where user_id = $1`,
        [uid]
      )
    afterEach(() => {
      grantSpy?.mockRestore()
      grantSpy = undefined
    })

    it('stay pending when the grant fails, and the next claim grants them', async () => {
      await addOldUser('old')
      const grant = failGrantOnce()
      const result = await regular('old')
      // The rest of the prize is paid; only the days wait.
      expect(result.prize).toEqual({
        mana: 0,
        freezes: 3,
        membership: [pending],
      })
      expect(await freezesOf('old')).toBe(3)
      expect((await prizeRows('old', 'total-trades')).regular).toMatchObject({
        m_tier: 'basic',
        days: 1,
        status: 'pending',
        outcome: null,
      })
      expect(await grantRows('old')).toEqual([])
      expect(result.rewarded).toHaveLength(3)

      // Any later claim retries what is pending before it answers.
      const next = await claim('old', 'account-age', 'newcomer')
      expect(next.prize).toEqual({ mana: 0, freezes: 1, membership: [] })
      expect(grant).toHaveBeenCalledTimes(2)
      expect((await prizeRows('old', 'total-trades')).regular).toMatchObject({
        status: 'granted',
        outcome: 'started',
        granted_ms: DAY,
      })
      expect(await grantRows('old')).toEqual([
        {
          tier: 'basic',
          duration_ms: DAY,
          source: 'trophy',
          source_id: 'total-trades/regular',
          status: 'active',
        },
      ])
      // Nothing is pending now, so nothing more is granted.
      await claim('old', 'account-age', 'newcomer')
      expect(grant).toHaveBeenCalledTimes(2)
    })

    it('are granted by the scheduler sweep once they are a minute old', async () => {
      await addOldUser('old')
      const grant = failGrantOnce()
      expect((await regular('old')).prize.membership).toEqual([pending])

      // Too fresh: the request that wrote them may still be granting.
      await settleTrophyPrizes()
      expect(grant).toHaveBeenCalledTimes(1)
      expect((await prizeRows('old', 'total-trades')).regular.status).toBe(
        'pending'
      )

      await ageRewards('old')
      await settleTrophyPrizes()
      expect(grant).toHaveBeenCalledTimes(2)
      expect((await prizeRows('old', 'total-trades')).regular).toMatchObject({
        status: 'granted',
        outcome: 'started',
      })
      expect(await grantRows('old')).toHaveLength(1)
      // The scheduler asks the API to announce the new membership.
      expect(relayMembershipBroadcast).toHaveBeenCalledTimes(1)
      expect(relayMembershipBroadcast).toHaveBeenCalledWith('old')

      await settleTrophyPrizes()
      expect(grant).toHaveBeenCalledTimes(2)
      expect(await grantRows('old')).toHaveLength(1)
    })

    it('wait longer after each failed pass, but not when the account claims', async () => {
      await addOldUser('old')
      const grant = (grantSpy = jest
        .spyOn(membershipGrants, 'grantMembershipDays')
        .mockRejectedValue(new Error('Bet queue full')))
      const waits = async () =>
        (
          await rows(
            `select membership_attempts as attempts,
               extract(epoch from membership_next_attempt_time - now()) / 60 as minutes
             from user_trophy_rewards where user_id = 'old' and milestone_id = 'regular'`
          )
        )[0]
      expect((await regular('old')).prize.membership).toEqual([pending])
      expect(await waits()).toMatchObject({ attempts: 1 })
      expect((await waits()).minutes).toBeGreaterThan(1.9)
      expect((await waits()).minutes).toBeLessThanOrEqual(2)

      // A minute old, but put off: the sweep leaves it alone.
      await rows(
        `update user_trophy_rewards set created_time = now() - interval '2 minutes' where user_id = 'old'`
      )
      await settleTrophyPrizes()
      expect(grant).toHaveBeenCalledTimes(1)

      await ageRewards('old')
      await settleTrophyPrizes()
      expect(grant).toHaveBeenCalledTimes(2)
      expect(await waits()).toMatchObject({ attempts: 2 })
      expect((await waits()).minutes).toBeGreaterThan(3.9)
      expect((await waits()).minutes).toBeLessThanOrEqual(4)
      expect(relayMembershipBroadcast).not.toHaveBeenCalled()

      // The account's own claim doesn't wait.
      grant.mockRestore()
      await claim('old', 'account-age', 'newcomer')
      expect((await prizeRows('old', 'total-trades')).regular).toMatchObject({
        status: 'granted',
        outcome: 'started',
      })
      expect(await grantRows('old')).toHaveLength(1)
    })

    // The days can be granted minutes or hours after the prize was judged.
    describe('for an account that can no longer be paid', () => {
      const banFrom = (type: string) => (uid: string) =>
        rows(`insert into user_bans (user_id, ban_type) values ($1, $2)`, [
          uid,
          type,
        ])
      const skippedRow = {
        m_tier: 'basic',
        days: 1,
        status: 'skipped',
        outcome: null,
        granted_ms: null,
      }

      it.each([
        [
          'became a bot',
          (uid: string) =>
            rows(`update users set is_bot = true where id = $1`, [uid]),
          (uid: string) =>
            rows(`update users set is_bot = false where id = $1`, [uid]),
        ],
        [
          'was deleted',
          (uid: string) =>
            rows(
              `update users set data = data || '{"userDeleted": true}' where id = $1`,
              [uid]
            ),
          (uid: string) =>
            rows(`update users set data = data - 'userDeleted' where id = $1`, [
              uid,
            ]),
        ],
        [
          'was banned from trading',
          banFrom('trading'),
          () => rows(`delete from user_bans`),
        ],
        [
          'was banned from posting',
          banFrom('posting'),
          () => rows(`delete from user_bans`),
        ],
        [
          'was flagged',
          (uid: string) => setEligibility(uid, 'requires_verification'),
          (uid: string) => setEligibility(uid, 'verified'),
        ],
        [
          'was bonus-blocked',
          (uid: string) => setEligibility(uid, 'ineligible'),
          (uid: string) => setEligibility(uid, 'verified'),
        ],
      ])(
        'are skipped, not granted, when it %s before they were granted',
        async (_, change, undo) => {
          await addOldUser('old')
          const grant = failGrantOnce()
          expect((await regular('old')).prize.membership).toEqual([pending])
          await change('old')
          await ageRewards('old')
          await settleTrophyPrizes()
          // Only the attempt that failed: no grant was tried for it again.
          expect(grant).toHaveBeenCalledTimes(1)
          expect(
            (await prizeRows('old', 'total-trades')).regular
          ).toMatchObject(skippedRow)
          expect(await grantRows('old')).toEqual([])
          expect(relayMembershipBroadcast).not.toHaveBeenCalled()

          // Skipped is final, even once the account can be paid again.
          await undo('old')
          await ageRewards('old')
          await settleTrophyPrizes()
          await claim('old', 'account-age', 'newcomer')
          expect(grant).toHaveBeenCalledTimes(1)
          expect(
            (await prizeRows('old', 'total-trades')).regular
          ).toMatchObject(skippedRow)
          expect(await grantRows('old')).toEqual([])
        }
      )

      it('are skipped for an account on the old trading ban list', async () => {
        const banned = BANNED_TRADING_USER_IDS[0]
        await addOldUser(banned)
        // Its claims pay nothing now. A part owed from before must not pay.
        await rows(
          `insert into user_trophy_rewards
             (user_id, trophy_id, milestone_id, mana, freezes,
              membership_tier, membership_days, membership_status)
           values ($1, 'total-trades', 'regular', 0, 1, 'basic', 1, 'pending')`,
          [banned]
        )
        await ageRewards(banned)
        await settleTrophyPrizes()
        expect((await prizeRows(banned, 'total-trades')).regular).toMatchObject(
          skippedRow
        )
        expect(await grantRows(banned)).toEqual([])
      })

      it("are not granted by a bot's later claim", async () => {
        await addOldUser('old')
        const grant = failGrantOnce()
        expect((await regular('old')).prize.membership).toEqual([pending])
        await rows(`update users set is_bot = true where id = 'old'`)
        // The claim settles what is pending, after paying the bot nothing.
        const next = await claim('old', 'account-age', 'newcomer')
        expect(next.prize).toEqual(NOTHING)
        expect(grant).toHaveBeenCalledTimes(1)
        expect((await prizeRows('old', 'total-trades')).regular).toMatchObject(
          skippedRow
        )
        expect(await grantRows('old')).toEqual([])
      })

      it('are still recorded when the grant was made before the change', async () => {
        await addOldUser('old')
        expect((await regular('old')).prize.membership).toEqual([started])
        // As if the process died after the grant and before recording it.
        await rows(
          `update user_trophy_rewards set membership_status = 'pending', membership_outcome = null,
             membership_granted_ms = null, membership_grant_id = null, membership_settled_time = null
           where user_id = 'old' and milestone_id = 'regular'`
        )
        await rows(`update users set is_bot = true where id = 'old'`)
        await ageRewards('old')
        await settleTrophyPrizes()
        expect((await prizeRows('old', 'total-trades')).regular).toMatchObject({
          status: 'granted',
          outcome: 'started',
          granted_ms: DAY,
        })
        expect(await grantRows('old')).toHaveLength(1)
      })

      it.each(['modAlert', 'marketControl'])(
        'are still granted under a %s ban, which does not stop a claim',
        async (type) => {
          await addOldUser('old')
          const grant = failGrantOnce()
          expect((await regular('old')).prize.membership).toEqual([pending])
          await banFrom(type)('old')
          await ageRewards('old')
          await settleTrophyPrizes()
          expect(grant).toHaveBeenCalledTimes(2)
          expect(
            (await prizeRows('old', 'total-trades')).regular
          ).toMatchObject({ status: 'granted', outcome: 'started' })
        }
      )
    })

    it('are granted once when a retry finds the grant already made', async () => {
      await addOldUser('old')
      expect((await regular('old')).prize.membership).toEqual([started])
      // As if the process died after the grant and before recording it.
      await rows(
        `update user_trophy_rewards set membership_status = 'pending', membership_outcome = null,
           membership_granted_ms = null, membership_grant_id = null, membership_settled_time = null
         where user_id = 'old' and milestone_id = 'regular'`
      )
      await ageRewards('old')
      await settleTrophyPrizes()
      expect((await prizeRows('old', 'total-trades')).regular).toMatchObject({
        status: 'granted',
        outcome: 'started',
        granted_ms: DAY,
      })
      expect(await grantRows('old')).toHaveLength(1)
      // The same again through a claim: still one grant.
      await rows(
        `update user_trophy_rewards set membership_status = 'pending', membership_outcome = null
         where user_id = 'old' and milestone_id = 'regular'`
      )
      await claim('old', 'account-age', 'newcomer')
      expect(await grantRows('old')).toHaveLength(1)
      expect((await prizeRows('old', 'total-trades')).regular).toMatchObject({
        status: 'granted',
        outcome: 'started',
      })
    })

    it.each([
      ['banked behind a paid Premium membership', true],
      ['already running', false],
    ])(
      'report the holding cap when the account holds 30 free days %s',
      async (_, paidPremium) => {
        await addOldUser('old')
        if (paidPremium) {
          await rows(
            `insert into user_entitlements (user_id, entitlement_id, expires_time)
             values ('old', 'supporter-premium', now() + interval '60 days')`
          )
        }
        await membershipGrants.grantMembershipDays(pg(), {
          userId: 'old',
          tier: 'basic',
          durationMs: 30 * DAY,
          source: 'admin',
          sourceId: 'gift',
        })
        const grant = jest.spyOn(membershipGrants, 'grantMembershipDays')
        const result = await enthusiast('old').finally(() =>
          grant.mockRestore()
        )
        // Mana and freezes are not affected by the cap.
        expect(result.prize).toEqual({
          mana: 50,
          freezes: 3,
          membership: [
            { tier: 'basic', days: 1, grantedDays: 0, outcome: 'capped' },
            { tier: 'basic', days: 2, grantedDays: 0, outcome: 'capped' },
          ],
        })
        expect(await prizeRows('old', 'total-trades')).toMatchObject({
          regular: { status: 'granted', outcome: 'capped', granted_ms: 0 },
          enthusiast: { status: 'granted', outcome: 'capped', granted_ms: 0 },
        })
        // No grant is made: not even one of the moments that have passed
        // since running days filled the cap. The rows are the receipts.
        expect(grant).not.toHaveBeenCalled()
        expect(await grantRows('old')).toEqual([
          expect.objectContaining({
            source: 'admin',
            status: paidPremium ? 'banked' : 'active',
          }),
        ])
        // Capped is final: more room later doesn't grant these again.
        await rows(`delete from membership_grants where user_id = 'old'`)
        await rows(`delete from user_entitlements where user_id = 'old'`)
        await ageRewards('old')
        await settleTrophyPrizes()
        expect((await claim('old', 'account-age', 'newcomer')).prize).toEqual({
          mana: 0,
          freezes: 1,
          membership: [],
        })
        expect(await grantRows('old')).toEqual([])
      }
    )

    it('record the grant when the cap was reached by the grant itself', async () => {
      await addOldUser('old')
      // As grantMembershipDays answers when the room goes between the check
      // and the grant: a used receipt of no length.
      const real = membershipGrants.grantMembershipDays
      const grant = jest
        .spyOn(membershipGrants, 'grantMembershipDays')
        .mockImplementation(async (db, input) => {
          await rows(
            `insert into membership_grants (user_id, tier, duration_ms, source, source_id, status, ended_time)
             values ($1, $2, 0, $3, $4, 'used', now())`,
            [input.userId, input.tier, input.source, input.sourceId]
          )
          const duplicate = await real(db, input)
          return { ...duplicate, outcome: 'capped' }
        })
      const result = await enthusiast('old').finally(() => grant.mockRestore())
      // Mana and freezes are not affected by the cap.
      expect(result.prize).toEqual({
        mana: 50,
        freezes: 3,
        membership: [
          { tier: 'basic', days: 1, grantedDays: 0, outcome: 'capped' },
          { tier: 'basic', days: 2, grantedDays: 0, outcome: 'capped' },
        ],
      })
      expect(await prizeRows('old', 'total-trades')).toMatchObject({
        regular: { status: 'granted', outcome: 'capped', granted_ms: 0 },
        enthusiast: { status: 'granted', outcome: 'capped', granted_ms: 0 },
      })
      // Kept as used receipts, so the same prize can't be granted later.
      expect(await grantRows('old')).toEqual([
        expect.objectContaining({ duration_ms: 0, status: 'used' }),
        expect.objectContaining({ duration_ms: 0, status: 'used' }),
      ])
    })

    it('report a grant the holding cap cut short', async () => {
      await addOldUser('old')
      await membershipGrants.grantMembershipDays(pg(), {
        userId: 'old',
        tier: 'basic',
        durationMs: 29.5 * DAY,
        source: 'admin',
        sourceId: 'gift',
      })
      const [part] = (await regular('old')).prize.membership
      expect(part).toMatchObject({ tier: 'basic', days: 1, outcome: 'banked' })
      // Half a day was left under the cap, plus the moments since the gift.
      expect(part.grantedDays).toBeGreaterThanOrEqual(0.5)
      expect(part.grantedDays).toBeLessThan(0.51)
    })
  })

  // Member pays seven days of the membership the account pays for.
  describe('days of the paid tier', () => {
    const member: trophies.TrophyDefinition = {
      id: 'starter-membership',
      label: 'Membership',
      description: '',
      category: 'starter',
      statKey: 'starterTrades',
      unit: 'trades',
      milestones: [
        {
          id: 'member',
          name: 'Member',
          emoji: '',
          threshold: 1,
          tier: 'green',
        },
      ],
    }
    const skipped = {
      tier: 'paid-tier',
      days: 7,
      grantedDays: 0,
      outcome: 'skipped',
    }
    const claimMember = () => claim('u', 'starter-membership', 'member')
    const subscribe = (tier: string, expires: string) =>
      rows(
        `insert into user_entitlements (user_id, entitlement_id, expires_time, auto_renew)
         values ('u', $1, now() + $2::interval, false)`,
        [`supporter-${tier}`, expires]
      )
    const gift = (tier: 'basic' | 'premium', days: number) =>
      membershipGrants.grantMembershipDays(pg(), {
        userId: 'u',
        tier,
        durationMs: days * DAY,
        source: 'admin',
        sourceId: 'gift',
      })

    let definition: jest.SpyInstance
    beforeEach(async () => {
      definition = jest
        .spyOn(trophies, 'getTrophyDefinition')
        .mockReturnValue(member)
      await addUser('u')
      await bet('u', 'm1', 10, 0)
    })
    afterEach(() => {
      definition.mockRestore()
    })

    it('are left unpaid without a membership, and paid once there is one', async () => {
      const first = await claimMember()
      expect(first.newlyClaimed).toHaveLength(1)
      expect(first.prize).toEqual({
        mana: 0,
        freezes: 0,
        membership: [skipped],
      })
      expect(await prizeRows('u', 'starter-membership')).toEqual({})
      expect(first.rewarded).toEqual([])
      expect(await grantRows('u')).toEqual([])

      await subscribe('basic', '10 days')
      const paid = await claimMember()
      expect(paid.prize.membership).toEqual([
        { tier: 'basic', days: 7, grantedDays: 7, outcome: 'started' },
      ])
      expect(await prizeRows('u', 'starter-membership')).toMatchObject({
        member: { m_tier: 'basic', days: 7, status: 'granted' },
      })
      expect(await grantRows('u')).toEqual([
        {
          tier: 'basic',
          duration_ms: 7 * DAY,
          source: 'trophy',
          source_id: 'starter-membership/member',
          status: 'active',
        },
      ])
      // The paid time is set aside, not replaced.
      expect(
        await rows(
          `select paused_paid->>'tier' as tier, (paused_paid->>'remainingMs')::numeric > 9 * 86400000 as kept
           from membership_grants where user_id = 'u'`
        )
      ).toEqual([{ tier: 'basic', kept: true }])
      expect((await claimMember()).prize).toEqual(NOTHING)
      expect(await grantRows('u')).toHaveLength(1)
    })

    it('do not count free membership days as a paid membership', async () => {
      await gift('basic', 5)
      expect(
        await rows(
          `select metadata->>'membershipGrantId' is not null as free from user_entitlements where user_id = 'u'`
        )
      ).toEqual([{ free: true }])
      expect((await claimMember()).prize.membership).toEqual([skipped])
      expect(await prizeRows('u', 'starter-membership')).toEqual({})
      expect(await grantRows('u')).toHaveLength(1)
    })

    it('do not count a membership that has run out', async () => {
      await subscribe('plus', '-2 days')
      expect((await claimMember()).prize.membership).toEqual([skipped])
      expect(await prizeRows('u', 'starter-membership')).toEqual({})
    })

    it('use the paid tier set aside while free days of a higher tier run', async () => {
      await subscribe('plus', '10 days')
      await gift('premium', 5)
      // Free Premium owns the supporter row; paid Pro waits behind it.
      expect(
        await rows(
          `select entitlement_id from user_entitlements where user_id = 'u'`
        )
      ).toEqual([{ entitlement_id: 'supporter-premium' }])
      expect((await claimMember()).prize.membership).toEqual([
        { tier: 'plus', days: 7, grantedDays: 7, outcome: 'banked' },
      ])
      expect(await prizeRows('u', 'starter-membership')).toMatchObject({
        member: { m_tier: 'plus', days: 7, outcome: 'banked' },
      })
    })
  })
})

describe('rank title prizes', () => {
  // An active trader with this net worth: ranked from M500,000.
  const holder = async (id: string, netWorth: number, data: object = {}) => {
    await addUser(id, {
      createdTime: START - 1,
      data: { lastBetTime: Date.now() - DAY, ...data },
    })
    await rows(
      `insert into user_portfolio_history_latest (user_id, balance, investment_value) values ($1, $2, 0)`,
      [id, netWorth]
    )
  }
  const mega = {
    mana: 0,
    freezes: 0,
    tier: 'free',
    m_tier: 'premium',
    days: 30,
    status: 'granted',
    outcome: 'started',
    granted_ms: 30 * DAY,
  }
  const superPrize = {
    mana: 0,
    freezes: 0,
    tier: 'free',
    m_tier: 'plus',
    days: 14,
    status: 'granted',
    outcome: 'started',
    granted_ms: 14 * DAY,
  }

  it('pays Mega and Super to the top five and Super to the rest, once', async () => {
    for (let i = 1; i <= 6; i++) await holder(`u${i}`, 1_000_000 - i * 1_000)
    await updateTrophyRanks()

    // Mega's 30 Premium days go first and fill the 30-day holding cap, so
    // Super's Pro days are recorded as capped and no grant is made for them.
    expect(await prizeRows('u1', 'net-worth')).toEqual({
      'rank:mega': mega,
      'rank:super': { ...superPrize, outcome: 'capped', granted_ms: 0 },
    })
    expect(await grantRows('u1')).toEqual([
      {
        tier: 'premium',
        duration_ms: 30 * DAY,
        source: 'trophy-rank',
        source_id: 'net-worth/mega',
        status: 'active',
      },
    ])
    expect(Object.keys(await prizeRows('u5', 'net-worth')).sort()).toEqual([
      'rank:mega',
      'rank:super',
    ])
    // Sixth place: Super only.
    expect(await prizeRows('u6', 'net-worth')).toEqual({
      'rank:super': superPrize,
    })
    expect(await grantRows('u6')).toEqual([
      {
        tier: 'plus',
        duration_ms: 14 * DAY,
        source: 'trophy-rank',
        source_id: 'net-worth/super',
        status: 'active',
      },
    ])
    expect(relayMembershipBroadcast).toHaveBeenCalledTimes(6)
    expect(relayMembershipBroadcast).toHaveBeenCalledWith('u6')
    // Title prizes are not milestones.
    expect((await trophiesOf('u1')).rewarded).toEqual([])
    expect(await rewardTxns('u1')).toEqual([])

    // The next night pays nobody again.
    jest.mocked(relayMembershipBroadcast).mockClear()
    await updateTrophyRanks()
    expect(relayMembershipBroadcast).not.toHaveBeenCalled()
    expect(
      await rows(
        `select count(*)::int as n from user_trophy_rewards where milestone_id like 'rank:%'`
      )
    ).toEqual([{ n: 11 }])
    // One grant each: Mega for the top five, Super for sixth place.
    expect(
      await rows(`select count(*)::int as n from membership_grants`)
    ).toEqual([{ n: 6 }])

    // Sixth place climbs to first: Mega is new, Super is not paid again.
    await rows(
      `update user_portfolio_history_latest set balance = 2000000 where user_id = 'u6'`
    )
    await updateTrophyRanks()
    const climbed = await prizeRows('u6', 'net-worth')
    expect(climbed['rank:super']).toEqual(superPrize)
    // About 16 days fit under the cap behind the Pro days still running.
    expect(climbed['rank:mega']).toMatchObject({
      m_tier: 'premium',
      days: 30,
      status: 'granted',
      outcome: 'banked',
    })
    expect(climbed['rank:mega'].granted_ms / DAY).toBeGreaterThanOrEqual(16)
    expect(climbed['rank:mega'].granted_ms / DAY).toBeLessThan(16.01)
    expect(await grantRows('u6')).toHaveLength(2)
    expect(relayMembershipBroadcast).toHaveBeenCalledTimes(1)
    expect(relayMembershipBroadcast).toHaveBeenCalledWith('u6')
    // Falling out of the ranks keeps the prizes and pays nothing new.
    await rows(
      `update user_portfolio_history_latest set balance = 1 where user_id = 'u1'`
    )
    await updateTrophyRanks()
    expect(Object.keys(await prizeRows('u1', 'net-worth'))).toHaveLength(2)
    expect(await grantRows('u1')).toHaveLength(1)
  })

  it('leaves a flagged or bonus-blocked holder unpaid until its standing allows membership days', async () => {
    await holder('flagged', 900_000, {
      bonusEligibility: 'requires_verification',
    })
    await holder('blocked', 800_000, { bonusEligibility: 'ineligible' })
    await updateTrophyRanks()
    expect((await trophiesOf('flagged')).rankPeaks).toEqual([
      { trophyId: 'net-worth', bestRank: 1 },
    ])
    for (const id of ['flagged', 'blocked']) {
      expect(await prizeRows(id, 'net-worth')).toEqual({})
      expect(await grantRows(id)).toEqual([])
    }
    expect(relayMembershipBroadcast).not.toHaveBeenCalled()

    // The best rank is kept, so the next run pays what is owed.
    await rows(
      `update users set data = data || '{"bonusEligibility": "verified"}' where id = 'flagged'`
    )
    await updateTrophyRanks()
    expect(Object.keys(await prizeRows('flagged', 'net-worth')).sort()).toEqual(
      ['rank:mega', 'rank:super']
    )
    expect(await prizeRows('blocked', 'net-worth')).toEqual({})
  })

  it('pays nothing to a holder banned since reaching the rank', async () => {
    await holder('u', 900_000)
    await updateTrophyRanks()
    // As if the prizes were still owed when the ban landed.
    await db.exec(`
      delete from user_trophy_rewards;
      delete from user_entitlements;
      delete from membership_grants;
      insert into user_bans (user_id, ban_type) values ('u', 'trading');
    `)
    await updateTrophyRanks()
    expect(await prizeRows('u', 'net-worth')).toEqual({})
    expect(await grantRows('u')).toEqual([])
  })

  it('leaves the days pending in order when a grant fails, for the sweep to finish', async () => {
    await holder('u', 900_000)
    const grant = jest
      .spyOn(membershipGrants, 'grantMembershipDays')
      .mockRejectedValueOnce(new Error('Database restarting'))
    try {
      await updateTrophyRanks()
      // Mega failed and stays owed. Super waits behind it rather than take
      // 14 of the 30 days of room Mega's Premium days are owed.
      expect(await prizeRows('u', 'net-worth')).toMatchObject({
        'rank:mega': { status: 'pending', outcome: null },
        'rank:super': { status: 'pending', outcome: null },
      })
      expect(grant).toHaveBeenCalledTimes(1)
      expect(await grantRows('u')).toEqual([])

      await rows(
        `update user_trophy_rewards set created_time = now() - interval '2 minutes',
           membership_next_attempt_time = now() - interval '1 second'`
      )
      await settleTrophyPrizes()
      expect(grant).toHaveBeenCalledTimes(2)
    } finally {
      grant.mockRestore()
    }
    // Mega in full, then Super finds the cap full.
    expect(await prizeRows('u', 'net-worth')).toEqual({
      'rank:mega': mega,
      'rank:super': { ...superPrize, outcome: 'capped', granted_ms: 0 },
    })
    expect(await grantRows('u')).toHaveLength(1)
    expect(relayMembershipBroadcast).toHaveBeenCalledWith('u')
  })

  // The holder is owed no new title, but its days are still owed.
  it('grants days left pending by an earlier night, and pays the title once', async () => {
    await holder('u', 900_000)
    const grant = jest
      .spyOn(membershipGrants, 'grantMembershipDays')
      .mockRejectedValueOnce(new Error('Database restarting'))
    try {
      await updateTrophyRanks()
      expect(await prizeRows('u', 'net-worth')).toMatchObject({
        'rank:mega': { status: 'pending' },
        'rank:super': { status: 'pending' },
      })
      expect(relayMembershipBroadcast).toHaveBeenCalledTimes(1)

      // The next night, with no sweep in between and the wait still running.
      await updateTrophyRanks()
      expect(grant).toHaveBeenCalledTimes(2)
      expect(await prizeRows('u', 'net-worth')).toEqual({
        'rank:mega': mega,
        'rank:super': { ...superPrize, outcome: 'capped', granted_ms: 0 },
      })
      expect(await grantRows('u')).toHaveLength(1)
      // The membership that started is announced.
      expect(relayMembershipBroadcast).toHaveBeenCalledTimes(2)

      // Nothing is pending now: a third night grants and announces nothing.
      await updateTrophyRanks()
      expect(grant).toHaveBeenCalledTimes(2)
      expect(relayMembershipBroadcast).toHaveBeenCalledTimes(2)
      expect(
        await rows(`select count(*)::int as n from user_trophy_rewards`)
      ).toEqual([{ n: 2 }])
    } finally {
      grant.mockRestore()
    }
  })

  it('skips days still pending for a holder kept out of the ranks or banned since', async () => {
    await holder('house', 900_000)
    await holder('banned', 800_000)
    const grant = jest
      .spyOn(membershipGrants, 'grantMembershipDays')
      .mockRejectedValue(new Error('Database restarting'))
    try {
      await updateTrophyRanks()
      expect(grant).toHaveBeenCalledTimes(2)
    } finally {
      grant.mockRestore()
    }
    await db.exec(`
      insert into trophy_rank_exclusions (user_id, reason) values ('house', 'House account');
      -- Not a ban that stops a claim, but one that keeps an account unranked.
      insert into user_bans (user_id, ban_type) values ('banned', 'marketControl');
    `)
    await updateTrophyRanks()
    for (const id of ['house', 'banned']) {
      expect(await prizeRows(id, 'net-worth')).toMatchObject({
        'rank:mega': { status: 'skipped', outcome: null },
        'rank:super': { status: 'skipped', outcome: null },
      })
      expect(await grantRows(id)).toEqual([])
    }
  })
})
