// The push notification bonus: accounts with the "Getting started" trophies
// earn Stay in the Loop for turning push on, so set-push-token pays the old
// bonus only to accounts from before them.
//
// Runs the real handler SQL against in-memory PostgreSQL.
import { PGlite } from '@electric-sql/pglite'
import * as pgPromise from 'pg-promise'

const START = Date.UTC(2026, 11, 1)

jest.mock('api/helpers/endpoint', () => ({
  APIError: jest.requireActual('common/api/utils').APIError,
}))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
  SERIAL_MODE: {},
}))
jest.mock('shared/utils', () => ({
  log: jest.fn(),
  getUser: jest.fn(),
  getPrivateUser: jest.fn(),
}))
jest.mock('shared/create-notification', () => ({
  createPushNotificationBonusNotification: jest.fn(),
}))
jest.mock('shared/websockets/helpers', () => ({
  broadcastUpdatedPrivateUser: jest.fn(),
}))
jest.mock('shared/txn/run-txn', () => ({ runTxnFromBank: jest.fn() }))
// Starter trophies are off on prod; turn them on from START for this test.
jest.mock('common/trophies', () => {
  const actual = jest.requireActual('common/trophies')
  return {
    ...actual,
    isStarterTrophyAccount: (createdTime: number) =>
      actual.isStarterTrophyAccount(createdTime, Date.UTC(2026, 11, 1)),
  }
})

import { getStarterStats } from 'api/helpers/trophies'
import { setPushToken } from 'api/push-token'
import { PUSH_NOTIFICATION_BONUS } from 'common/economy'
import { createPushNotificationBonusNotification } from 'shared/create-notification'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { getPrivateUser, getUser } from 'shared/utils'

const pgp = pgPromise()
let db: PGlite

const rows = async (sql: string, params?: unknown) =>
  (await db.query(pgp.as.format(sql, params))).rows as any[]

// The parts of pg-promise the handler uses.
const client = {
  oneOrNone: async (sql: string, params?: unknown) =>
    (await rows(sql, params))[0] ?? null,
  one: async (sql: string, params?: unknown) => {
    const result = await rows(sql, params)
    if (result.length !== 1) throw new Error('No data returned from the query.')
    return result[0]
  },
  // Like pg-promise: a statement run with none() must not return rows.
  none: async (sql: string, params?: unknown) => {
    if ((await rows(sql, params)).length) {
      throw new Error('No return data was expected.')
    }
  },
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

beforeAll(async () => {
  db = new PGlite({ parsers: { 1700: parseFloat } })
  await db.exec(`
    create table users (
      id text primary key,
      created_time timestamptz not null,
      data jsonb not null default '{}',
      is_bot boolean not null default false
    );
    create table private_users (id text primary key, data jsonb not null);
    create table txns (
      id text primary key default md5(random()::text),
      category text not null, from_id text not null, to_id text not null,
      amount numeric not null
    );
    -- Read by the starter stats, and empty here.
    create table user_bans (
      user_id text not null, ban_type text not null,
      end_time timestamptz, ended_at timestamptz
    );
    create table contracts (
      id text primary key, token text, creator_id text, resolution text,
      visibility text, deleted boolean, unique_bettor_count int, mechanism text
    );
    create table contract_bets (
      bet_id text primary key, user_id text, contract_id text, amount numeric,
      created_time timestamptz, data jsonb, is_redemption boolean, is_api boolean
    );
    create table user_contract_metrics (
      user_id text, contract_id text, answer_id text, profit numeric
    );
    create table group_members (group_id text, member_id text);
  `)
  jest
    .mocked(createSupabaseDirectClient)
    .mockReturnValue(
      client as unknown as ReturnType<typeof createSupabaseDirectClient>
    )
  jest.mocked(getUser).mockImplementation(async (userId: string) => {
    const [row] = await rows(`select * from users where id = $1`, [userId])
    return row
      ? {
          ...row.data,
          id: row.id,
          createdTime: new Date(row.created_time).valueOf(),
        }
      : null
  })
  jest.mocked(getPrivateUser).mockImplementation(async (userId: string) => {
    const [row] = await rows(`select * from private_users where id = $1`, [
      userId,
    ])
    return row ? row.data : null
  })
  // The real one moves the mana; here it only records the txn.
  jest.mocked(runTxnFromBank).mockImplementation((async (
    _tx: unknown,
    txn: { category: string; toId: string; amount: number }
  ) => {
    const [row] = await rows(
      `insert into txns (category, from_id, to_id, amount)
       values ($1, 'BANK', $2, $3) returning id`,
      [txn.category, txn.toId, txn.amount]
    )
    return { ...txn, id: row.id }
  }) as unknown as typeof runTxnFromBank)
})

afterAll(async () => {
  await db.close()
})

beforeEach(async () => {
  await db.exec(
    `delete from txns; delete from private_users; delete from users;`
  )
  jest.mocked(createPushNotificationBonusNotification).mockClear()
})

const addAccount = async (
  id: string,
  createdTime: number,
  data: object = {}
) => {
  await rows(`insert into users (id, created_time, data) values ($1, $2, $3)`, [
    id,
    new Date(createdTime),
    data,
  ])
  await rows(`insert into private_users values ($1, '{}')`, [id])
}
const setToken = (uid: string, pushToken: string) =>
  setPushToken({ pushToken }, { uid } as never, {} as never)
const bonusTxns = (uid: string) =>
  rows(
    `select amount from txns where to_id = $1 and category = 'PUSH_NOTIFICATION_BONUS'`,
    [uid]
  )
const pushEnabled = async (uid: string) =>
  (await getStarterStats(client as never, uid)).pushEnabled

describe('the push notification bonus', () => {
  it('is not paid to a starter account, which gets Stay in the Loop instead', async () => {
    await addAccount('new', START)
    expect(await pushEnabled('new')).toBe(0)
    await setToken('new', 'token-new')
    expect(await bonusTxns('new')).toEqual([])
    expect(createPushNotificationBonusNotification).not.toHaveBeenCalled()
    // The token is saved, and the trophy's stat sees it.
    expect(await pushEnabled('new')).toBe(1)
  })

  it('is still paid once to an account from before the starter trophies', async () => {
    await addAccount('old', START - 1)
    await setToken('old', 'token-old')
    expect(await bonusTxns('old')).toEqual([
      { amount: PUSH_NOTIFICATION_BONUS },
    ])
    expect(createPushNotificationBonusNotification).toHaveBeenCalledTimes(1)
    await setToken('old', 'token-old-2')
    expect(await bonusTxns('old')).toHaveLength(1)
    expect(createPushNotificationBonusNotification).toHaveBeenCalledTimes(1)
  })

  it('is not paid to a bonus-blocked account of either kind', async () => {
    for (const [id, createdTime] of [
      ['old', START - 1],
      ['new', START + 1],
    ] as const) {
      await addAccount(id, createdTime, { bonusEligibility: 'ineligible' })
      await setToken(id, `token-${id}`)
      expect(await bonusTxns(id)).toEqual([])
    }
  })

  it("moves a device's token to the account that registered it last", async () => {
    await addAccount('first', START)
    await addAccount('second', START)
    await setToken('first', 'device-token')
    await setToken('second', 'device-token')
    expect(await pushEnabled('first')).toBe(0)
    expect(await pushEnabled('second')).toBe(1)
  })
})
