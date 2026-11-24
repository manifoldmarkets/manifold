import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import * as pgPromise from 'pg-promise'
import {
  CREATORS_WITHOUT_NEW_QUESTION_NOTIFICATIONS,
  FOLLOW_CREATOR_PROMPT_COOLDOWN_MS,
} from 'common/follow-creator-prompt'
import { getDefaultNotificationPreferences } from 'common/user-notification-preferences'
import { SupabaseDirectClient } from 'shared/supabase/init'
import {
  decideFollowCreatorPrompt,
  FollowCreatorPromptMarketNotFound,
} from './follow-creator-prompt'

jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(() => {
    throw new Error('This test must not create a network database client')
  }),
}))

jest.setTimeout(60_000)

const pgp = pgPromise()

type Runner = {
  query: (sql: string) => Promise<{ rows: any[] }>
  exec: (sql: string) => Promise<unknown>
}
const clientFor = (runner: Runner, db: PGlite): SupabaseDirectClient => {
  const rows = async (sql: string, params?: unknown) =>
    (await runner.query(pgp.as.format(sql, params))).rows
  return {
    manyOrNone: rows,
    oneOrNone: async (sql: string, params?: unknown) => {
      const r = await rows(sql, params)
      if (r.length > 1) throw new Error(`Expected at most one row: ${sql}`)
      return r[0] ?? null
    },
    one: async (sql: string, params?: unknown) => {
      const r = await rows(sql, params)
      if (r.length !== 1) throw new Error(`Expected one row, got ${r.length}`)
      return r[0]
    },
    none: async (sql: string, params?: unknown) => {
      await runner.exec(pgp.as.format(sql, params))
    },
    tx: async (fn: (tx: SupabaseDirectClient) => Promise<unknown>) =>
      db.transaction((tx) => fn(clientFor(tx, db))),
  } as unknown as SupabaseDirectClient
}

const SCHEMA = `
  create role anon;
  create role authenticated;
  create table users (
    id text primary key, is_bot boolean not null default false,
    data jsonb not null default '{}'
  );
  create table private_users (id text primary key, data jsonb not null);
  create table user_follows (
    user_id text not null, follow_id text not null,
    primary key (user_id, follow_id)
  );
  create table contracts (
    id text primary key, creator_id text not null, visibility text
  );
  create table user_contract_metrics (
    user_id text not null, contract_id text not null, answer_id text,
    data jsonb not null
  );
`

let db: PGlite
let pg: SupabaseDirectClient

const addUser = async (
  id: string,
  opts: {
    isBot?: boolean
    deleted?: boolean
    blockedUserIds?: string[]
    inAppOn?: boolean
  } = {}
) => {
  await db.query(`insert into users (id, is_bot, data) values ($1, $2, $3)`, [
    id,
    !!opts.isBot,
    JSON.stringify(opts.deleted ? { userDeleted: true } : {}),
  ])
  await db.query(`insert into private_users (id, data) values ($1, $2)`, [
    id,
    JSON.stringify({
      id,
      notificationPreferences: {
        ...getDefaultNotificationPreferences(),
        contract_from_followed_user: opts.inAppOn === false ? [] : ['browser'],
      },
      blockedUserIds: opts.blockedUserIds ?? [],
      blockedByUserIds: [],
    }),
  ])
}

// `traded` of the creator's markets have an investment by `userId`.
const addMarkets = async (
  creatorId: string,
  count: number,
  traded: { userId: string; markets: number } | undefined,
  visibility = 'public'
) => {
  const ids: string[] = []
  for (let i = 0; i < count; i++) {
    const id = `${creatorId}-m${i}`
    ids.push(id)
    await db.query(
      `insert into contracts (id, creator_id, visibility) values ($1, $2, $3)`,
      [id, creatorId, visibility]
    )
    if (traded && i < traded.markets)
      await db.query(
        `insert into user_contract_metrics (user_id, contract_id, answer_id, data)
         values ($1, $2, null, $3)`,
        [traded.userId, id, JSON.stringify({ totalAmountInvested: 10 })]
      )
  }
  return ids
}

const decide = (
  userId: string,
  contractId: string,
  hasTopicInterests: (userId: string) => Promise<boolean> = async () => true,
  enabled?: boolean
) =>
  decideFollowCreatorPrompt(pg, {
    userId,
    contractId,
    hasTopicInterests,
    enabled,
  })

const records = async (userId: string) =>
  (
    await db.query<{
      creator_id: string
      contract_id: string
      markets_traded: number
    }>(
      `select creator_id, contract_id, markets_traded from follow_creator_prompts
       where user_id = $1 order by creator_id`,
      [userId]
    )
  ).rows

// Moves the user's prompts back in time.
const age = (userId: string, ms: number) =>
  db.query(
    `update follow_creator_prompts
     set prompted_time = prompted_time - ($2::bigint * interval '1 millisecond')
     where user_id = $1`,
    [userId, ms]
  )

beforeEach(async () => {
  db = new PGlite()
  await db.exec(SCHEMA)
  await db.exec(
    readFileSync(
      resolve(
        __dirname,
        '../../supabase/migrations/2026111701_follow_creator_prompts.sql'
      ),
      'utf8'
    )
  )
  pg = clientFor(db, db)
  await addUser('trader')
  await addUser('creator')
  await addUser('creator2')
})

afterEach(async () => {
  await db.close()
})

const DAY = FOLLOW_CREATOR_PROMPT_COOLDOWN_MS

describe('decideFollowCreatorPrompt', () => {
  it('shows and records the first prompt', async () => {
    const [m0] = await addMarkets('creator', 3, {
      userId: 'trader',
      markets: 3,
    })
    const before = Date.now()
    const result = await decide('trader', m0)
    expect(result).toMatchObject({
      creatorId: 'creator',
      show: true,
      eligible: true,
      marketsTraded: 3,
      why: { newQuestionNotifications: 'on', forYouBoost: true },
    })
    // nextPromptAt comes from the database clock (here the same machine).
    expect(result.nextPromptAt).toBeGreaterThanOrEqual(before + DAY - 5_000)
    expect(result.nextPromptAt).toBeLessThanOrEqual(Date.now() + DAY + 5_000)
    expect(await records('trader')).toEqual([
      { creator_id: 'creator', contract_id: m0, markets_traded: 3 },
    ])
  })

  it('stays quiet below the threshold and records nothing', async () => {
    const [m0] = await addMarkets('creator', 3, {
      userId: 'trader',
      markets: 2,
    })
    expect(await decide('trader', m0)).toEqual({
      creatorId: 'creator',
      show: false,
      eligible: true,
      marketsTraded: 2,
    })
    expect(await records('trader')).toEqual([])
  })

  it('holds every creator for 24 hours after a prompt', async () => {
    const [a] = await addMarkets('creator', 3, { userId: 'trader', markets: 3 })
    const [b] = await addMarkets('creator2', 3, {
      userId: 'trader',
      markets: 3,
    })
    const first = await decide('trader', a)
    expect(first.show).toBe(true)
    const second = await decide('trader', b)
    expect(second).toMatchObject({
      creatorId: 'creator2',
      show: false,
      eligible: true,
    })
    expect(second.nextPromptAt).toBe(first.nextPromptAt)
    await age('trader', DAY + 1000)
    expect((await decide('trader', b)).show).toBe(true)
    expect((await records('trader')).map((r) => r.creator_id)).toEqual([
      'creator',
      'creator2',
    ])
  })

  it('holds the same creator for 30 days', async () => {
    const [a] = await addMarkets('creator', 3, { userId: 'trader', markets: 3 })
    expect((await decide('trader', a)).show).toBe(true)
    await age('trader', 25 * 60 * 60 * 1000)
    expect(await decide('trader', a)).toEqual({
      creatorId: 'creator',
      show: false,
      eligible: false,
      marketsTraded: 0,
    })
    await age('trader', 29 * DAY)
    const again = await decide('trader', a)
    expect(again.show).toBe(true)
    expect(await records('trader')).toHaveLength(1)
  })

  it('treats users independently', async () => {
    await addUser('trader2')
    const [a] = await addMarkets('creator', 3, { userId: 'trader', markets: 3 })
    for (let i = 0; i < 3; i++)
      await db.query(
        `insert into user_contract_metrics (user_id, contract_id, answer_id, data)
         values ('trader2', $1, null, '{"totalAmountInvested": 5}')`,
        [`creator-m${i}`]
      )
    expect((await decide('trader', a)).show).toBe(true)
    expect((await decide('trader2', a)).show).toBe(true)
  })

  it.each([
    [
      'already following',
      async () =>
        db.query(
          `insert into user_follows (user_id, follow_id) values ('trader', 'creator')`
        ),
    ],
    [
      'blocked',
      async () =>
        db.query(
          `update private_users set data = jsonb_set(data, '{blockedUserIds}', '["creator"]') where id = 'trader'`
        ),
    ],
    [
      'a bot creator',
      async () =>
        db.query(`update users set is_bot = true where id = 'creator'`),
    ],
    [
      'a deleted creator',
      async () =>
        db.query(
          `update users set data = '{"userDeleted": true}' where id = 'creator'`
        ),
    ],
  ])('never prompts when %s', async (_, setup) => {
    const [a] = await addMarkets('creator', 3, { userId: 'trader', markets: 3 })
    await setup()
    expect(await decide('trader', a)).toEqual({
      creatorId: 'creator',
      show: false,
      eligible: false,
      marketsTraded: 0,
    })
    expect(await records('trader')).toEqual([])
  })

  it('never prompts to follow yourself', async () => {
    const [a] = await addMarkets('trader', 3, { userId: 'trader', markets: 3 })
    expect((await decide('trader', a)).eligible).toBe(false)
  })

  it('says when in-app new-question notifications are off', async () => {
    await db.query(
      `update private_users
       set data = jsonb_set(data, '{notificationPreferences,contract_from_followed_user}', '[]')
       where id = 'trader'`
    )
    const [a] = await addMarkets('creator', 3, { userId: 'trader', markets: 3 })
    expect((await decide('trader', a)).why?.newQuestionNotifications).toBe(
      'in_app_off'
    )
  })

  it('makes no notification claim for creators whose markets never notify', async () => {
    const sports = CREATORS_WITHOUT_NEW_QUESTION_NOTIFICATIONS[0]
    await addUser(sports)
    const [a] = await addMarkets(sports, 3, { userId: 'trader', markets: 3 })
    expect((await decide('trader', a)).why).toEqual({
      newQuestionNotifications: 'none',
      forYouBoost: true,
    })
  })

  it('leaves out the For you boost without topic scores', async () => {
    const [a] = await addMarkets('creator', 3, { userId: 'trader', markets: 3 })
    const result = await decide('trader', a, async () => false)
    expect(result.why?.forYouBoost).toBe(false)
    await age('trader', 31 * DAY)
    const failing = await decide('trader', a, async () => {
      throw new Error('cache down')
    })
    expect(failing.show).toBe(true)
    expect(failing.why?.forYouBoost).toBe(false)
  })

  it('never shows with the kill switch off', async () => {
    const [a] = await addMarkets('creator', 3, { userId: 'trader', markets: 3 })
    expect((await decide('trader', a, undefined, false)).show).toBe(false)
    expect(await records('trader')).toEqual([])
  })

  it('treats legacy private markets as not found', async () => {
    const [a] = await addMarkets(
      'creator',
      3,
      { userId: 'trader', markets: 3 },
      'private'
    )
    await expect(decide('trader', a)).rejects.toBeInstanceOf(
      FollowCreatorPromptMarketNotFound
    )
  })

  it('counts unlisted markets the trader traded on', async () => {
    const [a] = await addMarkets('creator', 2, { userId: 'trader', markets: 2 })
    await db.query(
      `insert into contracts (id, creator_id, visibility) values ('u1', 'creator', 'unlisted')`
    )
    await db.query(
      `insert into user_contract_metrics (user_id, contract_id, answer_id, data)
       values ('trader', 'u1', null, '{"totalAmountInvested": 1}')`
    )
    expect((await decide('trader', a)).marketsTraded).toBe(3)
  })
})
