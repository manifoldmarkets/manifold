import { PGlite } from '@electric-sql/pglite'
import * as pgPromise from 'pg-promise'
import { Contract } from 'common/contract'
import { NO_NEW_MARKET_EMAIL_CREATOR_IDS } from 'common/envs/constants'
import { Notification } from 'common/notification'
import { User } from 'common/user'
import { getDefaultNotificationPreferences } from 'common/user-notification-preferences'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { createNewContractNotification } from './create-new-contract-notif'

// The real SQL runs against an in-memory PostgreSQL (PGlite). The database
// client, broadcasts and emails are swapped out through globals, so the
// module registry made for the digest-off case (jest.isolateModules) sees
// the same ones.
type TestGlobals = {
  __notifTestPg?: SupabaseDirectClient
  __notifTestBroadcasts?: { topic: string; notification: Notification }[]
  __notifTestEmails?: { subject: string; to: string[] }[]
  __notifTestLogErrors?: string[]
}
const testGlobals = global as unknown as TestGlobals

jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: () =>
    (global as unknown as TestGlobals).__notifTestPg,
  pgp: jest.requireActual('pg-promise')(),
}))
jest.mock('shared/utils', () => ({
  log: Object.assign(jest.fn(), {
    error: (message: string) =>
      (global as unknown as TestGlobals).__notifTestLogErrors?.push(message),
    warn: jest.fn(),
  }),
}))
jest.mock('shared/websockets/server', () => ({
  broadcast: (topic: string, payload: { notification: Notification }) =>
    (global as unknown as TestGlobals).__notifTestBroadcasts?.push({
      topic,
      notification: payload.notification,
    }),
}))
jest.mock('../emails', () => ({
  getNewFollowedMarketEmail: (
    _reason: string,
    name: string,
    privateUser: { email?: string },
    contract: { question: string }
  ) =>
    privateUser.email
      ? [privateUser.email, { name, questionTitle: contract.question }]
      : undefined,
  sendBulkEmails: async (
    subject: string,
    _template: string,
    recipients: [string, unknown][]
  ) => {
    if (recipients.length > 0)
      (global as unknown as TestGlobals).__notifTestEmails?.push({
        subject,
        to: recipients.map(([email]) => email),
      })
  },
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
    any: rows,
    map: async (sql: string, params: unknown, fn: (row: any) => unknown) =>
      (await rows(sql, params)).map((row) => fn(row)),
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
  create table users (
    id text primary key, name text not null, username text not null,
    is_bot boolean not null default false, data jsonb not null default '{}'
  );
  create table private_users (id text primary key, data jsonb not null);
  create table user_follows (
    user_id text not null, follow_id text not null,
    primary key (user_id, follow_id)
  );
  create table contracts (
    id text primary key, creator_id text not null,
    created_time timestamptz not null, visibility text not null,
    deleted boolean not null default false, data jsonb not null default '{}'
  );
  create table user_notifications (
    data jsonb not null, notification_id text not null, user_id text not null,
    primary key (user_id, notification_id)
  );
`

const CREATOR: User = {
  id: 'creator',
  name: 'Mikhail',
  username: 'MikhailTal',
  avatarUrl: 'https://example.com/a.png',
} as User

let db: PGlite
let pg: SupabaseDirectClient
let failCount = false

const privateUserData = (
  id: string,
  opts: { email?: string; emailOn?: boolean; browserOn?: boolean } = {}
) => {
  const prefs = getDefaultNotificationPreferences()
  const destinations = [
    ...(opts.browserOn === false ? [] : ['browser']),
    ...(opts.emailOn ? ['email'] : []),
  ]
  return {
    id,
    email: opts.email,
    notificationPreferences: {
      ...prefs,
      contract_from_followed_user: destinations,
      tagged_user: ['browser'],
    },
    blockedUserIds: [] as string[],
    blockedByUserIds: [] as string[],
    blockedContractIds: [] as string[],
    blockedGroupSlugs: [] as string[],
  }
}

const addUser = async (
  id: string,
  opts: Parameters<typeof privateUserData>[1] & { blockedBy?: string[] } = {}
) => {
  await db.query(`insert into users (id, name, username) values ($1, $2, $1)`, [
    id,
    `Name ${id}`,
  ])
  await db.query(`insert into private_users (id, data) values ($1, $2)`, [
    id,
    JSON.stringify({
      ...privateUserData(id, opts),
      blockedByUserIds: opts.blockedBy ?? [],
    }),
  ])
}

const follow = (userId: string, followId = CREATOR.id) =>
  db.query(`insert into user_follows (user_id, follow_id) values ($1, $2)`, [
    userId,
    followId,
  ])

let nextId = 0
// Inserts the market (committed, as when onCreateMarket runs) and notifies.
const createMarket = async (
  createdAt: string,
  opts: {
    visibility?: 'public' | 'unlisted'
    mentioned?: string[]
    creator?: User
    notify?: typeof createNewContractNotification
  } = {}
) => {
  const creator = opts.creator ?? CREATOR
  const id = `m${++nextId}`
  const visibility = opts.visibility ?? 'public'
  await db.query(
    `insert into contracts (id, creator_id, created_time, visibility)
     values ($1, $2, $3, $4)`,
    [id, creator.id, createdAt, visibility]
  )
  const contract = {
    id,
    slug: `slug-${id}`,
    question: `Question ${id}?`,
    visibility,
    creatorId: creator.id,
    creatorUsername: creator.username,
  } as Contract
  await (opts.notify ?? createNewContractNotification)(
    creator,
    contract,
    `${id}-on-create`,
    '',
    opts.mentioned ?? []
  )
  return id
}

const rowsFor = async (userId: string) =>
  (
    await db.query<{ notification_id: string; data: Notification }>(
      `select notification_id, data from user_notifications
       where user_id = $1 order by notification_id`,
      [userId]
    )
  ).rows

const broadcastsTo = (userId: string) =>
  (testGlobals.__notifTestBroadcasts ?? []).filter(
    (b) => b.topic === `user-notifications/${userId}`
  )

beforeEach(async () => {
  db = new PGlite()
  await db.exec(SCHEMA)
  const base = clientFor(db, db)
  // Lets a test make the per-day count fail.
  pg = {
    ...base,
    oneOrNone: async (sql: string, params?: unknown) => {
      if (failCount && sql.includes('markets_that_day'))
        throw new Error('count failed')
      return (base.oneOrNone as any)(sql, params)
    },
  } as unknown as SupabaseDirectClient
  testGlobals.__notifTestPg = pg
  testGlobals.__notifTestBroadcasts = []
  testGlobals.__notifTestEmails = []
  testGlobals.__notifTestLogErrors = []
  failCount = false
  await addUser(CREATOR.id)
})

afterEach(async () => {
  await db.close()
})

// 2026-11-17 is a Pacific Standard Time day: 08:00Z to 08:00Z.
const nov17 = (minute: number) =>
  new Date(Date.parse('2026-11-17T09:00:00Z') + minute * 60_000).toISOString()

describe('createNewContractNotification', () => {
  it('notifies one by one up to 5 a day, then once with a digest', async () => {
    await addUser('a', { email: 'a@example.com', emailOn: true })
    await addUser('b')
    await addUser('c', {
      email: 'c@example.com',
      emailOn: true,
      blockedBy: [CREATOR.id],
    })
    for (const id of ['a', 'b', 'c']) await follow(id)

    const ids: string[] = []
    for (let i = 0; i < 7; i++) ids.push(await createMarket(nov17(i)))

    const digestId = 'new-questions-creator-2026-11-17'
    for (const userId of ['a', 'b']) {
      const rows = await rowsFor(userId)
      expect(rows.map((r) => r.notification_id).sort()).toEqual(
        [...ids.slice(0, 5).map((id) => `${id}-on-create`), digestId].sort()
      )
      const digest = rows.find((r) => r.notification_id === digestId)?.data
      expect(digest).toMatchObject({
        id: digestId,
        userId,
        reason: 'contract_from_followed_user',
        sourceType: 'new_questions_digest',
        sourceId: CREATOR.id,
        sourceUserUsername: CREATOR.username,
        sourceTitle: 'more than 5 questions on Nov 17 (Pacific time)',
        sourceContractTitle: 'more than 5 questions on Nov 17 (Pacific time)',
        sourceSlug: 'MikhailTal?tab=questions',
        isSeen: false,
        data: { creatorId: CREATOR.id, day: '2026-11-17' },
      })
      // One broadcast per row, the digest once.
      expect(broadcastsTo(userId).map((b) => b.notification.id)).toEqual([
        ...ids.slice(0, 5).map((id) => `${id}-on-create`),
        digestId,
      ])
    }
    // Blocked by the creator: nothing at all.
    expect(await rowsFor('c')).toEqual([])
    expect(broadcastsTo('c')).toEqual([])
    // Email only for the first 5 markets, only to A.
    expect(testGlobals.__notifTestEmails).toEqual(
      ids.slice(0, 5).map((id) => ({
        subject: `Mikhail asked Question ${id}?`,
        to: ['a@example.com'],
      }))
    )
  })

  it('counts unlisted markets but never notifies followers of them', async () => {
    await addUser('a')
    await follow('a')
    for (let i = 0; i < 5; i++)
      await createMarket(nov17(i), { visibility: 'unlisted' })
    expect(await rowsFor('a')).toEqual([])
    await createMarket(nov17(10))
    expect((await rowsFor('a')).map((r) => r.notification_id)).toEqual([
      'new-questions-creator-2026-11-17',
    ])
  })

  it('never lets a 6th one-by-one notification out after an unlisting', async () => {
    await addUser('a')
    await follow('a')
    const ids: string[] = []
    for (let i = 0; i < 5; i++) ids.push(await createMarket(nov17(i)))
    await db.query(
      `update contracts set visibility = 'unlisted' where id = $1`,
      [ids[2]]
    )
    await createMarket(nov17(10))
    const rows = (await rowsFor('a')).map((r) => r.notification_id)
    expect(rows.filter((id) => id.endsWith('-on-create'))).toHaveLength(5)
    expect(rows).toContain('new-questions-creator-2026-11-17')
  })

  it('still notifies a mention after the digest', async () => {
    await addUser('a')
    await addUser('b')
    await follow('a')
    await follow('b')
    for (let i = 0; i < 6; i++) await createMarket(nov17(i))
    const before = broadcastsTo('b').length
    const id = await createMarket(nov17(7), { mentioned: ['b'] })
    const tagged = (await rowsFor('b')).find(
      (r) => r.notification_id === `${id}-on-create`
    )?.data
    expect(tagged).toMatchObject({
      reason: 'tagged_user',
      sourceContractId: id,
    })
    expect(
      broadcastsTo('b')
        .slice(before)
        .map((b) => b.notification.id)
    ).toEqual([`${id}-on-create`])
    // A, not mentioned, hears nothing more.
    expect(
      (await rowsFor('a')).some((r) => r.notification_id === `${id}-on-create`)
    ).toBe(false)
  })

  it('mentions a follower one by one before the limit, as before', async () => {
    await addUser('a')
    await addUser('outsider')
    await follow('a')
    const id = await createMarket(nov17(0), { mentioned: ['a', 'outsider'] })
    expect((await rowsFor('a')).map((r) => r.data.reason)).toEqual([
      'tagged_user',
    ])
    // Unchanged here: a mentioned non-follower gets nothing from this path.
    expect(await rowsFor('outsider')).toEqual([])
    expect(id).toBeDefined()
  })

  it('gives a late follower the digest once, and nobody else anything', async () => {
    await addUser('a')
    await addUser('d')
    await follow('a')
    for (let i = 0; i < 7; i++) await createMarket(nov17(i))
    const aBroadcasts = broadcastsTo('a').length
    await follow('d')
    await createMarket(nov17(8))
    await createMarket(nov17(9))
    expect((await rowsFor('d')).map((r) => r.notification_id)).toEqual([
      'new-questions-creator-2026-11-17',
    ])
    expect(broadcastsTo('d')).toHaveLength(1)
    expect(broadcastsTo('a')).toHaveLength(aBroadcasts)
  })

  it('keeps each follower their own digest row (ids shared across users)', async () => {
    await addUser('a')
    await addUser('b')
    await follow('a')
    await follow('b')
    for (let i = 0; i < 6; i++) await createMarket(nov17(i))
    const { rows } = await db.query<{ user_id: string }>(
      `select user_id from user_notifications
       where notification_id = 'new-questions-creator-2026-11-17'
       order by user_id`
    )
    expect(rows.map((r) => r.user_id)).toEqual(['a', 'b'])
  })

  it('uses Pacific calendar days across the fall-back change (25 h day)', async () => {
    await addUser('a')
    await follow('a')
    // Nov 1 2026 Pacific runs 07:00Z to 08:00Z on Nov 2.
    for (let i = 0; i < 5; i++)
      await createMarket(
        new Date(Date.parse('2026-11-01T07:30:00Z') + i * 60_000).toISOString()
      )
    await createMarket('2026-11-02T07:30:00Z') // 23:30 PST on Nov 1
    const late = await createMarket('2026-11-02T08:00:00Z') // 00:00 Nov 2
    const ids = (await rowsFor('a')).map((r) => r.notification_id)
    expect(ids).toContain('new-questions-creator-2026-11-01')
    expect(ids).toContain(`${late}-on-create`)
    expect(ids).not.toContain('new-questions-creator-2026-11-02')
  })

  it('uses Pacific calendar days across the spring-forward change (23 h day)', async () => {
    await addUser('a')
    await follow('a')
    // Mar 8 2026 Pacific runs 08:00Z to 07:00Z on Mar 9.
    for (let i = 0; i < 5; i++)
      await createMarket(
        new Date(Date.parse('2026-03-08T08:00:00Z') + i * 60_000).toISOString()
      )
    await createMarket('2026-03-09T06:59:00Z') // 23:59 PDT on Mar 8
    const next = await createMarket('2026-03-09T07:00:00Z') // 00:00 Mar 9
    const ids = (await rowsFor('a')).map((r) => r.notification_id)
    expect(ids).toContain('new-questions-creator-2026-03-08')
    expect(ids).toContain(`${next}-on-create`)
  })

  it('counts per creator', async () => {
    const other = { ...CREATOR, id: 'other', username: 'other' } as User
    await addUser(other.id)
    await addUser('a')
    await follow('a')
    await follow('a', other.id)
    for (let i = 0; i < 5; i++) await createMarket(nov17(i))
    const id = await createMarket(nov17(6), { creator: other })
    expect(
      (await rowsFor('a')).some((r) => r.notification_id === `${id}-on-create`)
    ).toBe(true)
  })

  it('notifies no follower when the count fails, but still the mentions', async () => {
    await addUser('a', { email: 'a@example.com', emailOn: true })
    await addUser('b')
    await follow('a')
    await follow('b')
    failCount = true
    const id = await createMarket(nov17(0), { mentioned: ['b'] })
    expect(await rowsFor('a')).toEqual([])
    expect((await rowsFor('b')).map((r) => r.notification_id)).toEqual([
      `${id}-on-create`,
    ])
    expect(testGlobals.__notifTestEmails).toEqual([])
    expect(testGlobals.__notifTestLogErrors?.length).toBeGreaterThan(0)
  })

  it('never emails followers of creators in NO_NEW_MARKET_EMAIL_CREATOR_IDS', async () => {
    const bulk = {
      ...CREATOR,
      id: NO_NEW_MARKET_EMAIL_CREATOR_IDS[0],
      username: 'bulk',
    } as User
    await addUser(bulk.id)
    await addUser('a', { email: 'a@example.com', emailOn: true })
    await follow('a', bulk.id)
    await createMarket(nov17(0), { creator: bulk })
    expect((await rowsFor('a')).length).toBe(1)
    expect(testGlobals.__notifTestEmails).toEqual([])
  })

  it('does not fail or broadcast again when a market is notified twice', async () => {
    await addUser('a')
    await follow('a')
    const id = await createMarket(nov17(0))
    const contract = {
      id,
      slug: `slug-${id}`,
      question: `Question ${id}?`,
      visibility: 'public',
      creatorId: CREATOR.id,
      creatorUsername: CREATOR.username,
    } as Contract
    await createNewContractNotification(
      CREATOR,
      contract,
      `${id}-on-create`,
      '',
      []
    )
    expect(await rowsFor('a')).toHaveLength(1)
    expect(broadcastsTo('a')).toHaveLength(1)
  })

  it('respects a follower who turned the in-app notification off', async () => {
    await addUser('a', { browserOn: false })
    await follow('a')
    for (let i = 0; i < 6; i++) await createMarket(nov17(i))
    expect(await rowsFor('a')).toEqual([])
  })

  it('notifies every market one by one with the digest switched off', async () => {
    let notify: typeof createNewContractNotification | undefined
    jest.isolateModules(() => {
      jest.doMock('common/new-question-notifications', () => ({
        ...jest.requireActual('common/new-question-notifications'),
        NEW_QUESTION_DIGEST_ENABLED: false,
      }))
      notify = (
        jest.requireActual('./create-new-contract-notif') as {
          createNewContractNotification: typeof createNewContractNotification
        }
      ).createNewContractNotification
    })
    await addUser('a')
    await follow('a')
    for (let i = 0; i < 7; i++) await createMarket(nov17(i), { notify })
    const ids = (await rowsFor('a')).map((r) => r.notification_id)
    expect(ids).toHaveLength(7)
    expect(ids.every((id) => id.endsWith('-on-create'))).toBe(true)
  })
})
