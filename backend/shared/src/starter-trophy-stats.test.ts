// Live stats behind the "Getting started" trophies and Close Call: the
// starter counts and the streak freeze count.
//
// Runs the real SQL against in-memory PostgreSQL.
import { PGlite } from '@electric-sql/pglite'
import * as pgPromise from 'pg-promise'

const START = Date.UTC(2026, 11, 1)

jest.mock('api/helpers/endpoint', () => ({
  APIError: jest.requireActual('common/api/utils').APIError,
}))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
}))
jest.mock('shared/utils', () => ({ log: jest.fn() }))
jest.mock('shared/create-notification', () => ({
  createStreakFreezeUsedNotification: jest.fn(),
}))

import {
  STARTER_STATS_BET_LIMIT,
  STARTER_STATS_ROW_LIMIT,
  getStarterStats,
} from 'api/helpers/trophies'
import { EMPTY_STARTER_STATS, StarterStats } from 'common/trophies'
import { createStreakFreezeUsedNotification } from 'shared/create-notification'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { resetBettingStreaksInternal } from 'scheduler/jobs/reset-betting-streaks'

const pgp = pgPromise()
let db: PGlite
const parsers = {
  20: (value: string) => parseInt(value, 10),
  1700: parseFloat,
}

const rows = async (sql: string, params?: unknown) =>
  (await db.query(pgp.as.format(sql, params))).rows as any[]

// The parts of pg-promise the code under test uses.
const client = {
  one: async (sql: string, params?: unknown) => {
    const result = await rows(sql, params)
    if (result.length !== 1) throw new Error('No data returned from the query.')
    return result[0]
  },
  manyOrNone: async (sql: string, params?: unknown) => rows(sql, params),
  // Like pg-promise: a statement run with none() must not return rows.
  none: async (sql: string, params?: unknown) => {
    if ((await rows(sql, params)).length) {
      throw new Error('No return data was expected.')
    }
  },
}
type Pg = Parameters<typeof getStarterStats>[0]
const pg = client as unknown as Pg

beforeAll(async () => {
  db = new PGlite({ parsers })
  await db.exec(`
    create table users (
      id text primary key,
      created_time timestamptz not null default now(),
      data jsonb not null default '{}',
      is_bot boolean not null default false
    );
    create table private_users (id text primary key, data jsonb not null);
    create table user_bans (
      user_id text not null, ban_type text not null,
      end_time timestamptz, ended_at timestamptz
    );
    create table contracts (
      id text primary key, token text not null, creator_id text, resolution text,
      visibility text, deleted boolean, unique_bettor_count int, mechanism text
    );
    create table contract_bets (
      bet_id text primary key,
      user_id text not null,
      contract_id text not null,
      amount numeric,
      created_time timestamptz not null,
      data jsonb not null default '{}',
      is_redemption boolean,
      is_api boolean
    );
    create index contract_bets_user_id_created_time
      on contract_bets (user_id, created_time desc);
    create table user_contract_metrics (
      user_id text, contract_id text, answer_id text, profit numeric
    );
    create table group_members (
      group_id text not null, member_id text not null,
      primary key (group_id, member_id)
    );
    create table txns (
      id text primary key default md5(random()::text),
      category text not null, from_id text not null, to_id text not null,
      amount numeric not null
    );
    create function ts_to_millis(ts timestamptz) returns bigint
      language sql immutable as $$ select (extract(epoch from ts) * 1000)::bigint $$;
    insert into contracts (id, token, mechanism) values
      ('m1', 'MANA', 'cpmm-1'), ('m2', 'MANA', 'cpmm-1'), ('cash1', 'CASH', 'cpmm-1');
  `)
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
    delete from contract_bets;
    delete from user_contract_metrics;
    delete from contracts where id not in ('m1', 'm2', 'cash1');
    delete from group_members;
    delete from private_users;
    delete from user_bans;
    delete from txns;
    delete from users;
  `)
  jest.mocked(createStreakFreezeUsedNotification).mockClear()
})

const DAY = 24 * 60 * 60 * 1000
// Noon UTC is 4 am Pacific, so each `day` is its own Pacific day.
const at = (day: number) => new Date(START + DAY * day + 12 * 60 * 60 * 1000)

const addUser = (
  id: string,
  opts: { createdTime?: number; data?: object; isBot?: boolean } = {}
) =>
  rows(
    `insert into users (id, created_time, data, is_bot) values ($1, $2, $3, $4)`,
    [
      id,
      new Date(opts.createdTime ?? START + 1000),
      opts.data ?? {},
      opts.isBot ?? false,
    ]
  )

const bet = (
  userId: string,
  contractId: string,
  amount: number,
  day: number,
  extra: { isRedemption?: boolean; isApi?: boolean; data?: object } = {}
) =>
  rows(
    `insert into contract_bets
      (bet_id, user_id, contract_id, amount, created_time, is_redemption, is_api, data)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      `bet-${betId++}`,
      userId,
      contractId,
      amount,
      at(day),
      extra.isRedemption ?? false,
      extra.isApi ?? null,
      extra.data ?? {},
    ]
  )

const market = (
  id: string,
  opts: {
    token?: string
    creatorId?: string
    resolution?: string | null
    visibility?: string
    deleted?: boolean
    traders?: number
    mechanism?: string
  } = {}
) =>
  rows(
    `insert into contracts
      (id, token, creator_id, resolution, visibility, deleted, unique_bettor_count, mechanism)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      opts.token ?? 'MANA',
      opts.creatorId ?? 'someone-else',
      opts.resolution ?? null,
      opts.visibility ?? 'public',
      opts.deleted ?? false,
      opts.traders ?? 0,
      opts.mechanism ?? 'cpmm-1',
    ]
  )

const metric = (
  userId: string,
  contractId: string,
  profit: number | string,
  answerId: string | null = null
) =>
  rows(
    `insert into user_contract_metrics (user_id, contract_id, answer_id, profit)
     values ($1, $2, $3, $4::numeric)`,
    [userId, contractId, answerId, profit]
  )

const txn = (category: string, fromId: string, toId: string, amount = 100) =>
  rows(
    `insert into txns (category, from_id, to_id, amount) values ($1, $2, $3, $4)`,
    [category, fromId, toId, amount]
  )

const statsOf = (userId: string) => getStarterStats(pg, userId)
const expectStats = async (userId: string, expected: Partial<StarterStats>) =>
  expect(await statsOf(userId)).toEqual({ ...EMPTY_STARTER_STATS, ...expected })

describe('starter bet stats', () => {
  it('are all zero for an account with no activity, or no account at all', async () => {
    await addUser('u')
    await expectStats('u', {})
    await expectStats('nobody', {})
  })

  it('count market-days whose sells add up to M10 in mana markets', async () => {
    await addUser('u')
    await bet('u', 'm1', 100, 0)
    await bet('u', 'm1', -10, 0) // a sale
    await bet('u', 'm1', -25, 0) // same market and day: counts once
    await bet('u', 'm1', -9.99, 1) // under M10 on its own
    await bet('u', 'm2', -5, 1) // two legs of one sale add up
    await bet('u', 'm2', -5, 1)
    await bet('u', 'm2', -40, 2, { isRedemption: true })
    await bet('u', 'm2', -40, 2, { isApi: true })
    await bet('u', 'cash1', -40, 2) // not a mana market
    await expectStats('u', {
      starterTrades: 1,
      starterMarkets: 1,
      starterDays: 1,
      starterSells: 2,
    })
  })

  it('count sale legs whose float amounts sum to just under M10', async () => {
    await addUser('u')
    await bet('u', 'm1', -4.999999999999993, 0)
    await bet('u', 'm1', -4.999999999999993, 0)
    await expectStats('u', { starterSells: 1 })
  })

  it('count limit orders of M10 or more, filled or not', async () => {
    await addUser('u')
    const order = (orderAmount: number, more: object = {}) => ({
      data: { limitProb: 0.4, orderAmount, ...more },
    })
    await bet('u', 'm1', 0, 0, order(10)) // resting, nothing filled yet
    await bet('u', 'm1', 0, 0, order(9.99)) // too small
    // A slippage-protected buy: a silent limit order that expires at once.
    await bet('u', 'm1', 50, 1, order(50, { silent: true }))
    await bet('u', 'm2', 20, 1, { data: { orderAmount: 20 } }) // a market buy
    await bet('u', 'm2', 0, 1, {
      isApi: true,
      data: { limitProb: 0.4, orderAmount: 100 },
    })
    await bet('u', 'cash1', 0, 1, order(100))
    await expectStats('u', {
      starterTrades: 2,
      starterMarkets: 2,
      starterDays: 1,
      starterLimitOrders: 1,
    })
    await bet('u', 'm2', 30, 2, order(30)) // filled at once still counts
    expect(await statsOf('u')).toMatchObject({
      starterTrades: 3,
      starterLimitOrders: 2,
    })
  })

  it('does not spend the bet limit on arbitrage legs and redemptions', async () => {
    await addUser('u')
    // 60 purchases in 60 markets whose 40 answers sum to one: each writes the
    // bet and 39 legs saved as redemptions (2,400 rows in all).
    await rows(
      `insert into contracts (id, token, mechanism)
       select 'multi-' || n, 'MANA', 'cpmm-multi-1' from generate_series(1, 60) n`
    )
    await rows(
      `insert into contract_bets
        (bet_id, user_id, contract_id, amount, created_time, is_redemption)
       select 'leg-' || n || '-' || leg, 'u', 'multi-' || n,
         case when leg = 1 then 10 else 0 end,
         $1::timestamptz + n * interval '1 minute', leg > 1
       from generate_series(1, 60) n, generate_series(1, 40) leg`,
      [at(0)]
    )
    await expectStats('u', {
      starterTrades: 60,
      starterMarkets: 60,
      starterDays: 1,
    })
  })

  it('reads only the first bets, in order of placement', async () => {
    await addUser('u')
    // The limit's worth of M1 bets in one market on one day, then one more.
    await rows(
      `insert into contract_bets
        (bet_id, user_id, contract_id, amount, created_time, is_redemption)
       select 'early-' || n, 'u', 'm1', 1,
         $1::timestamptz + n * interval '1 second', false
       from generate_series(1, $2) n`,
      [at(0), STARTER_STATS_BET_LIMIT]
    )
    await bet('u', 'm2', 100, 1)
    await bet('u', 'm2', -100, 1)
    await expectStats('u', {
      starterTrades: 1,
      starterMarkets: 1,
      starterDays: 1,
    })
    // With one early bet fewer, the M100 purchase is inside the limit, and
    // the sale after it is not.
    await rows(`delete from contract_bets where bet_id = 'early-1'`)
    await expectStats('u', {
      starterTrades: 2,
      starterMarkets: 2,
      starterDays: 2,
    })
  })

  it('stops reading at the row limit', async () => {
    await addUser('u')
    await rows(
      `insert into contract_bets
        (bet_id, user_id, contract_id, amount, created_time, is_redemption)
       select 'red-' || n, 'u', 'm1', 0,
         $1::timestamptz + n * interval '1 second', true
       from generate_series(1, $2) n`,
      [at(0), STARTER_STATS_ROW_LIMIT]
    )
    await bet('u', 'm1', 100, 1)
    await expectStats('u', {})
    await rows(`delete from contract_bets where bet_id = 'red-1'`)
    await expectStats('u', {
      starterTrades: 1,
      starterMarkets: 1,
      starterDays: 1,
    })
  })
})

describe('starter account stats', () => {
  it('count resolved mana markets with a profit that the account did not create, up to three', async () => {
    await addUser('u')
    await market('won', { resolution: 'YES' })
    await metric('u', 'won', 12.5)
    await metric('u', 'won', 50, 'answer-1') // answer rows are not the summary

    await market('lost', { resolution: 'NO' })
    await metric('u', 'lost', -20)
    await market('open')
    await metric('u', 'open', 30)
    await market('cancelled', { resolution: 'CANCEL' })
    await metric('u', 'cancelled', 30)
    await market('own', { resolution: 'YES', creatorId: 'u' })
    await metric('u', 'own', 30)
    await market('deleted', { resolution: 'YES', deleted: true })
    await metric('u', 'deleted', 30)
    await market('cash', { resolution: 'YES', token: 'CASH' })
    await metric('u', 'cash', 30)
    await market('dust', { resolution: 'YES' })
    await metric('u', 'dust', 1e-9)
    await market('nan', { resolution: 'YES' })
    await metric('u', 'nan', 'NaN')
    await market('no-creator', { resolution: 'MKT' })
    await rows(`update contracts set creator_id = null where id = 'no-creator'`)
    await expectStats('u', { starterWins: 1 })

    await metric('u', 'no-creator', 0.01)
    await expectStats('u', { starterWins: 2 })
    for (const id of ['w3', 'w4', 'w5']) {
      await market(id, { resolution: 'NO' })
      await metric('u', id, 5)
    }
    await expectStats('u', { starterWins: 3 })
    // Someone else's wins are their own.
    await expectStats('someone-else', {})
  })

  it('count topics followed, up to three', async () => {
    await addUser('u')
    const follow = (groupId: string, memberId = 'u') =>
      rows(`insert into group_members (group_id, member_id) values ($1, $2)`, [
        groupId,
        memberId,
      ])
    await follow('g1')
    await follow('g2')
    await follow('g1', 'other')
    await expectStats('u', { topicsFollowed: 2 })
    await follow('g3')
    await follow('g4')
    await expectStats('u', { topicsFollowed: 3 })
  })

  it('see push notifications as on with a push token, or the old bonus', async () => {
    await addUser('u')
    await expectStats('u', {})
    await rows(`insert into private_users values ('u', '{}')`)
    await expectStats('u', {})
    await rows(`update private_users set data = '{"pushToken": ""}'`)
    await expectStats('u', {})
    await rows(`update private_users set data = '{"pushToken": "token"}'`)
    await expectStats('u', { pushEnabled: 1 })

    // Signing out removes the token; the bonus txn stays.
    await addUser('paid')
    await txn('PUSH_NOTIFICATION_BONUS', 'BANK', 'paid', 1000)
    await expectStats('paid', { pushEnabled: 1 })
    await expectStats('u', { pushEnabled: 1 })
    await rows(`update private_users set data = '{}'`)
    await expectStats('u', {})
  })

  it('count a public market the account created once it has five traders', async () => {
    await addUser('u')
    await market('four', { creatorId: 'u', traders: 4 })
    await market('unlisted', {
      creatorId: 'u',
      traders: 9,
      visibility: 'unlisted',
    })
    await market('gone', { creatorId: 'u', traders: 9, deleted: true })
    await market('poll', { creatorId: 'u', traders: 9, mechanism: 'none' })
    await market('cash', { creatorId: 'u', traders: 9, token: 'CASH' })
    await market('theirs', { creatorId: 'other', traders: 9 })
    await expectStats('u', {})
    await rows(`update contracts set unique_bettor_count = 5 where id = 'four'`)
    await expectStats('u', { starterPopularMarkets: 1 })
    await market('another', { creatorId: 'u', traders: 50 })
    await expectStats('u', { starterPopularMarkets: 1 })
  })

  it('count a person who signed up with the referral', async () => {
    await addUser('u', { data: { referredByUserId: 'u' } }) // a self-referral
    await addUser('bot', { data: { referredByUserId: 'u' }, isBot: true })
    await addUser('deleted', {
      data: { referredByUserId: 'u', userDeleted: true },
    })
    await addUser('banned', { data: { referredByUserId: 'u' } })
    await rows(`insert into user_bans values ('banned', 'trading', null, null)`)
    await addUser('elsewhere', { data: { referredByUserId: 'other' } })
    await expectStats('u', {})

    await addUser('friend', { data: { referredByUserId: 'u' } })
    // A warning is not a ban, and an ended ban is over.
    await rows(
      `insert into user_bans values
        ('friend', 'modAlert', null, null), ('friend', 'posting', null, now())`
    )
    await expectStats('u', { starterReferrals: 1 })
    await addUser('friend-2', { data: { referredByUserId: 'u' } })
    await expectStats('u', { starterReferrals: 1 })
  })

  it('see a membership as paid only once the account has paid for one', async () => {
    await addUser('u')
    // Free days (membership_grants) change the entitlement and pay nothing.
    await txn('SHOP_PURCHASE', 'u', 'BANK', 500)
    await txn('MEMBERSHIP_PAYMENT', 'other', 'BANK', 500)
    await txn('TROPHY_REWARD', 'BANK', 'u', 500)
    await expectStats('u', {})
    await txn('MEMBERSHIP_PAYMENT', 'u', 'BANK', 500)
    await expectStats('u', { paidMembership: 1 })
    await expectStats('other', { paidMembership: 1 })
  })
})

describe('streak freezes used', () => {
  const user = async (id: string) =>
    (await rows(`select data from users where id = $1`, [id]))[0].data
  const addStreakUser = (id: string, data: object, lastBetDaysAgo: number) =>
    addUser(id, {
      data: { ...data, lastBetTime: Date.now() - lastBetDaysAgo * DAY },
    })

  it('counts each night a freeze saves the streak', async () => {
    await addStreakUser(
      'saved',
      { currentBettingStreak: 5, streakForgiveness: 2 },
      2
    )
    await addStreakUser(
      'reset',
      { currentBettingStreak: 4, streakForgiveness: 0 },
      2
    )
    await addStreakUser(
      'active',
      { currentBettingStreak: 3, streakForgiveness: 1 },
      0
    )

    await resetBettingStreaksInternal()
    expect(await user('saved')).toMatchObject({
      currentBettingStreak: 5,
      streakForgiveness: 1,
      streakFreezesUsed: 1,
    })
    expect((await user('saved')).lastStreakFreezeTime).toBeGreaterThan(0)
    expect(await user('reset')).toMatchObject({
      currentBettingStreak: 0,
      longestBettingStreak: 4,
    })
    expect((await user('reset')).streakFreezesUsed).toBeUndefined()
    expect(await user('active')).toEqual({
      currentBettingStreak: 3,
      streakForgiveness: 1,
      lastBetTime: expect.any(Number),
    })
    expect(createStreakFreezeUsedNotification).toHaveBeenCalledWith(
      [{ id: 'saved', streak: 5, freezesRemaining: 1 }],
      expect.anything()
    )

    // The second night uses the last freeze; the third ends the streak.
    await resetBettingStreaksInternal()
    expect(await user('saved')).toMatchObject({
      currentBettingStreak: 5,
      streakForgiveness: 0,
      streakFreezesUsed: 2,
    })
    await resetBettingStreaksInternal()
    expect(await user('saved')).toMatchObject({
      currentBettingStreak: 0,
      longestBettingStreak: 5,
      streakForgiveness: 0,
      streakFreezesUsed: 2,
    })
  })
})
