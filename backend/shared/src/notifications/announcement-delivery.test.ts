// Announcements are sent to every user, in batches, resumably, against an
// in-memory PostgreSQL.
//
// The announcement_deliveries table is built by running the repository's own
// migration file. users, old_posts and user_notifications are the columns
// the sender reads and writes, with user_notifications' real primary key. The
// sender and create-post run their own SQL through the parts of pg-promise
// they use. No live database or network is used.
import { readFileSync } from 'fs'
import { join } from 'path'
import { PGlite } from '@electric-sql/pglite'
import * as pgPromise from 'pg-promise'

jest.mock('shared/monitoring/log', () => ({
  log: Object.assign(jest.fn(), { warn: jest.fn(), error: jest.fn() }),
}))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
}))
jest.mock('api/helpers/rate-limit', () => ({
  onlyUsersWhoCanPerformAction: (_action: string, handler: unknown) => handler,
}))
jest.mock('api/helpers/endpoint', () => ({
  APIError: jest.requireActual('common/api/utils').APIError,
}))
jest.mock('shared/utils', () => ({
  getUser: jest.fn(),
  sanitizeJsonContent: (content: unknown) => content,
}))
jest.mock('shared/new-account-gate', () => ({
  passesNewAccountGate: jest.fn(async () => true),
  newAccountGateMessage: (action: string) => `${action} is gated`,
}))
jest.mock('shared/notifications/create-new-post-notif', () => ({
  createNewPostFromFollowedUserNotification: jest.fn(),
}))

import { createPost } from 'api/create-post'
import { ENV_CONFIG } from 'common/envs/constants'
import { Notification } from 'common/notification'
import { User } from 'common/user'
import { createNewPostFromFollowedUserNotification } from 'shared/notifications/create-new-post-notif'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { getUser } from 'shared/utils'
import {
  deliverAnnouncement,
  queueAnnouncementDelivery,
  resumeStalledAnnouncementDeliveries,
} from './announcement-delivery'

const pgp = pgPromise()
const MIGRATION = join(
  __dirname,
  '../../../supabase/migrations/2026112201_announcement_deliveries.sql'
)

let db: PGlite
let depth = 0
// Throws in place of running a statement, while it returns true.
let failStatement: (sql: string) => boolean = () => false

const rows = async (sql: string, params?: unknown) => {
  const text = pgp.as.format(sql, params)
  if (failStatement(text))
    throw new Error('canceling statement due to statement timeout')
  return (await db.query(text)).rows as any[]
}
// The parts of pg-promise the code under test uses. A transaction inside a
// transaction is a savepoint, as it is in pg-promise.
const client = {
  oneOrNone: async (
    sql: string,
    params?: unknown,
    fn?: (row: any) => unknown
  ) => {
    const row = (await rows(sql, params))[0] ?? null
    return row && fn ? fn(row) : row
  },
  one: async (sql: string, params?: unknown) => {
    const result = await rows(sql, params)
    if (result.length !== 1) throw new Error('No data returned from the query.')
    return result[0]
  },
  manyOrNone: (sql: string, params?: unknown) => rows(sql, params),
  map: async (sql: string, params: unknown, fn: (row: any) => unknown) =>
    (await rows(sql, params)).map(fn),
  none: async (sql: string, params?: unknown) => {
    await rows(sql, params)
  },
  tx: async (fn: (tx: unknown) => Promise<unknown>) => {
    const level = depth++
    await db.exec(level ? `savepoint level_${level}` : 'begin')
    try {
      const result = await fn(client)
      await db.exec(level ? `release savepoint level_${level}` : 'commit')
      return result
    } catch (error) {
      await db.exec(level ? `rollback to savepoint level_${level}` : 'rollback')
      throw error
    } finally {
      depth--
    }
  },
}
const pg = client as unknown as SupabaseDirectClient

const ADMIN = ENV_CONFIG.adminIds[0]
const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

const addUsers = async (count: number, prefix = 'u') => {
  for (let i = 0; i < count; i++)
    await rows(`insert into users (id) values ($1)`, [
      `${prefix}${String(i).padStart(3, '0')}`,
    ])
}
const addPost = async (
  id: string,
  options: { isAnnouncement?: boolean; visibility?: string; text?: string } = {}
) =>
  rows(`insert into old_posts (id, data) values ($1, $2)`, [
    id,
    {
      id,
      slug: `slug-${id}`,
      title: `Title ${id}`,
      content: doc(options.text ?? `Body of ${id}`),
      creatorId: ADMIN,
      creatorName: 'Gen',
      creatorUsername: 'Gen',
      creatorAvatarUrl: 'https://avatar',
      isAnnouncement: options.isAnnouncement ?? true,
      visibility: options.visibility ?? 'public',
    },
  ])
const unlist = (id: string) =>
  rows(
    `update old_posts set data = data || '{"visibility":"unlisted"}' where id = $1`,
    [id]
  )
const notificationsFor = async (postId: string) =>
  (
    await rows(
      `select user_id, notification_id, data from user_notifications
       where data->>'sourceId' = $1 order by user_id`,
      [postId]
    )
  ).map((r) => ({
    userId: r.user_id as string,
    notificationId: r.notification_id as string,
    data: r.data as Notification,
  }))
const deliveryOf = async (postId: string) =>
  (
    await rows(`select * from announcement_deliveries where post_id = $1`, [
      postId,
    ])
  )[0]
const userIds = async () =>
  (await rows(`select id from users order by id`)).map((r) => r.id as string)
const insertsIntoNotifications = (sql: string) =>
  sql.includes('insert into user_notifications')

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create table users (
      id text primary key,
      created_time timestamptz not null default now()
    );
    create table old_posts (id text primary key, data jsonb not null);
    create table user_notifications (
      data jsonb not null,
      notification_id text not null,
      user_id text not null,
      primary key (user_id, notification_id)
    );
  `)
  await db.exec(readFileSync(MIGRATION, 'utf8'))
})

beforeEach(async () => {
  failStatement = () => false
  await db.exec(`
    truncate users, old_posts, user_notifications, announcement_deliveries;
  `)
  jest.clearAllMocks()
})

describe('deliverAnnouncement', () => {
  it('sends every user one notification, in batches, and finishes', async () => {
    await addUsers(10)
    await addPost('p1')
    await queueAnnouncementDelivery(pg, 'p1')

    const result = await deliverAnnouncement(pg, 'p1', { batchSize: 3 })

    expect(result).toEqual({
      postId: 'p1',
      sent: 10,
      totalSent: 10,
      finished: true,
    })
    const sent = await notificationsFor('p1')
    expect(sent.map((n) => n.userId)).toEqual(await userIds())
    // Each its own id.
    expect(new Set(sent.map((n) => n.notificationId)).size).toBe(10)
    for (const n of sent) {
      expect(n.data).toMatchObject({
        id: n.notificationId,
        userId: n.userId,
        reason: 'admin',
        isSeen: false,
        sourceId: 'p1',
        sourceType: 'post',
        sourceUpdateType: 'created',
        sourceUserName: 'Gen',
        sourceUserUsername: 'Gen',
        sourceUserAvatarUrl: 'https://avatar',
        sourceText: 'Body of p1',
        sourceSlug: 'post/slug-p1',
        sourceTitle: 'Title p1',
      })
    }
    const delivery = await deliveryOf('p1')
    expect(delivery.sent_count).toBe(10)
    expect(delivery.last_user_id).toBe('u009')
    expect(delivery.finished_time).not.toBeNull()
    expect(delivery.last_error).toBeNull()
  })

  it('finishes when the users divide exactly into batches', async () => {
    await addUsers(6)
    await addPost('p1')
    await queueAnnouncementDelivery(pg, 'p1')

    const result = await deliverAnnouncement(pg, 'p1', { batchSize: 3 })

    expect(result.finished).toBe(true)
    expect(result.totalSent).toBe(6)
    expect((await notificationsFor('p1')).length).toBe(6)
  })

  it('stamps each batch with the time it is sent, not when it was queued', async () => {
    // The notifications page fetches only what is newer than its newest
    // notification, so a late batch must not carry an earlier time.
    await addUsers(4)
    await addPost('p1')
    await queueAnnouncementDelivery(pg, 'p1')
    let clock = 1_000_000
    const now = jest
      .spyOn(Date, 'now')
      .mockImplementation(() => (clock += 1000))
    try {
      await deliverAnnouncement(pg, 'p1', { batchSize: 2 })
    } finally {
      now.mockRestore()
    }

    const times = (await notificationsFor('p1')).map((n) => n.data.createdTime)
    expect(times[0]).toBe(times[1])
    expect(times[2]).toBe(times[3])
    expect(times[2]).toBeGreaterThan(times[0])
  })

  it('retries a failed batch, and nobody gets it twice', async () => {
    await addUsers(9)
    await addPost('p1')
    await queueAnnouncementDelivery(pg, 'p1')
    let inserts = 0
    failStatement = (sql) => insertsIntoNotifications(sql) && ++inserts === 2 // the second batch, once

    const result = await deliverAnnouncement(pg, 'p1', {
      batchSize: 3,
      retryDelayMs: 0,
    })

    expect(result.finished).toBe(true)
    const sent = await notificationsFor('p1')
    expect(sent.map((n) => n.userId)).toEqual(await userIds())
  })

  it('stops after repeated failures where the last batch committed, and resumes from there', async () => {
    await addUsers(9)
    await addPost('p1')
    await queueAnnouncementDelivery(pg, 'p1')
    let inserts = 0
    // The first batch goes in; every later one fails.
    failStatement = (sql) => insertsIntoNotifications(sql) && ++inserts > 1

    const stopped = await deliverAnnouncement(pg, 'p1', {
      batchSize: 3,
      retryDelayMs: 0,
    })

    expect(stopped).toMatchObject({
      sent: 3,
      totalSent: 3,
      finished: false,
      error: 'canceling statement due to statement timeout',
    })
    expect((await notificationsFor('p1')).map((n) => n.userId)).toEqual([
      'u000',
      'u001',
      'u002',
    ])
    const delivery = await deliveryOf('p1')
    expect(delivery).toMatchObject({
      last_user_id: 'u002',
      sent_count: 3,
      finished_time: null,
      last_error: 'canceling statement due to statement timeout',
    })

    failStatement = () => false
    const resumed = await deliverAnnouncement(pg, 'p1', { batchSize: 3 })

    expect(resumed).toMatchObject({ sent: 6, totalSent: 9, finished: true })
    expect((await notificationsFor('p1')).map((n) => n.userId)).toEqual(
      await userIds()
    )
    expect((await deliveryOf('p1')).last_error).toBeNull()
  })

  it('sends nothing more once finished', async () => {
    await addUsers(3)
    await addPost('p1')
    await queueAnnouncementDelivery(pg, 'p1')
    await deliverAnnouncement(pg, 'p1')

    const again = await deliverAnnouncement(pg, 'p1')

    expect(again).toMatchObject({ sent: 0, totalSent: 3, finished: true })
    expect((await notificationsFor('p1')).length).toBe(3)
  })

  it('goes to the users who existed when it was queued, wherever their id falls', async () => {
    await addUsers(4)
    await addPost('p1')
    await queueAnnouncementDelivery(pg, 'p1')
    let inserts = 0
    failStatement = (sql) => insertsIntoNotifications(sql) && ++inserts > 1
    await deliverAnnouncement(pg, 'p1', { batchSize: 2, retryDelayMs: 0 })
    failStatement = () => false
    await addUsers(1, 'z') // signed up mid-send, id after the cursor
    await addUsers(1, 'a') // and before it

    await deliverAnnouncement(pg, 'p1', { batchSize: 2 })

    const got = (await notificationsFor('p1')).map((n) => n.userId)
    expect(got).toEqual(['u000', 'u001', 'u002', 'u003'])
    expect((await deliveryOf('p1')).finished_time).not.toBeNull()
  })

  it('skips users who already have it, when queued to', async () => {
    await addUsers(6)
    await addPost('p1')
    // Two users the old sender reached.
    for (const userId of ['u001', 'u004'])
      await rows(
        `insert into user_notifications (user_id, notification_id, data)
         values ($1, 'old', $2)`,
        [userId, { id: 'old', sourceId: 'p1', sourceType: 'post' }]
      )
    await queueAnnouncementDelivery(pg, 'p1', { skipUsersWhoHaveIt: true })

    const result = await deliverAnnouncement(pg, 'p1', { batchSize: 2 })

    expect(result).toMatchObject({ sent: 4, totalSent: 4, finished: true })
    const got = (await notificationsFor('p1')).map((n) => n.userId)
    expect(got).toEqual(await userIds())
    expect((await deliveryOf('p1')).last_user_id).toBe('u005')
  })

  it('stops a send whose post is unlisted, before or during it', async () => {
    await addUsers(4)
    await addPost('before', { visibility: 'unlisted' })
    await addPost('during')
    await queueAnnouncementDelivery(pg, 'before')
    await queueAnnouncementDelivery(pg, 'during')

    expect(await deliverAnnouncement(pg, 'before')).toMatchObject({
      sent: 0,
      finished: true,
      closed: 'post is unlisted',
    })
    // Still reported as closed, not as sent, on a later call.
    expect(await deliverAnnouncement(pg, 'before')).toMatchObject({
      sent: 0,
      finished: true,
      closed: 'post is unlisted',
    })

    let inserts = 0
    failStatement = (sql) => insertsIntoNotifications(sql) && ++inserts > 1
    await deliverAnnouncement(pg, 'during', { batchSize: 2, retryDelayMs: 0 })
    failStatement = () => false
    await unlist('during')

    expect(
      await deliverAnnouncement(pg, 'during', { batchSize: 2 })
    ).toMatchObject({ sent: 0, totalSent: 2, closed: 'post is unlisted' })
    expect((await notificationsFor('before')).length).toBe(0)
    expect((await notificationsFor('during')).map((n) => n.userId)).toEqual([
      'u000',
      'u001',
    ])
    expect((await deliveryOf('during')).finished_time).not.toBeNull()
  })

  it('cuts the text between characters, never inside an emoji', async () => {
    await addUsers(1)
    // 199 letters then an emoji: a cut at 200 UTF-16 units splits it.
    const text = 'a'.repeat(199) + '\u{1F600}' + 'more'
    // The old cut, which this one replaces, cannot be stored.
    await expect(
      rows(`select $1::jsonb`, [JSON.stringify({ t: text.slice(0, 200) })])
    ).rejects.toThrow('invalid input syntax for type json')
    await addPost('p1', { text })
    await queueAnnouncementDelivery(pg, 'p1')

    expect(await deliverAnnouncement(pg, 'p1')).toMatchObject({ sent: 1 })
    const [p1] = await notificationsFor('p1')
    expect(p1.data.sourceText).toBe('a'.repeat(199) + '\u{1F600}')
  })

  it('refuses a batch size that would never advance', async () => {
    await addPost('p1')
    await queueAnnouncementDelivery(pg, 'p1')

    await expect(
      deliverAnnouncement(pg, 'p1', { batchSize: 0 })
    ).rejects.toThrow('batchSize must be a positive integer')
  })

  it('does nothing for a post that was never queued', async () => {
    await addUsers(3)
    await addPost('p1')

    const result = await deliverAnnouncement(pg, 'p1')

    expect(result).toMatchObject({
      sent: 0,
      finished: false,
      error: 'not queued',
    })
    expect((await notificationsFor('p1')).length).toBe(0)
  })

  it('closes the delivery of a post that is not an announcement, or is gone', async () => {
    await addUsers(3)
    await addPost('p1', { isAnnouncement: false })
    await queueAnnouncementDelivery(pg, 'p1')
    await queueAnnouncementDelivery(pg, 'gone')

    expect(await deliverAnnouncement(pg, 'p1')).toMatchObject({
      sent: 0,
      finished: true,
      closed: 'post is not an announcement',
    })
    expect(await deliverAnnouncement(pg, 'gone')).toMatchObject({
      sent: 0,
      finished: true,
      closed: 'post not found',
    })
    expect((await rows(`select * from user_notifications`)).length).toBe(0)
    expect((await deliveryOf('p1')).finished_time).not.toBeNull()
    expect((await deliveryOf('gone')).finished_time).not.toBeNull()
  })

  it('queues a post once however often it is queued', async () => {
    await addPost('p1')
    await queueAnnouncementDelivery(pg, 'p1')
    await queueAnnouncementDelivery(pg, 'p1')

    expect((await rows(`select * from announcement_deliveries`)).length).toBe(1)
  })

  it('migration upgrades a table made by its first draft', async () => {
    const fresh = new PGlite()
    try {
      // The table as 2023b9450's version of the migration made it.
      await fresh.exec(`
        create table announcement_deliveries (
          post_id text primary key,
          created_time timestamptz not null default now(),
          last_user_id text,
          sent_count int not null default 0,
          finished_time timestamptz,
          updated_time timestamptz not null default now(),
          last_error text
        );
      `)
      await fresh.exec(readFileSync(MIGRATION, 'utf8'))
      const columns = (
        await fresh.query(
          `select column_name from information_schema.columns
           where table_name = 'announcement_deliveries'`
        )
      ).rows.map((r: any) => r.column_name)
      expect(columns).toContain('skip_existing')
    } finally {
      await fresh.close()
    }
  })
})

describe('resumeStalledAnnouncementDeliveries', () => {
  it('resumes sends that stopped moving, and leaves running and finished ones', async () => {
    await addUsers(3)
    for (const id of ['stalled', 'running', 'finished']) {
      await addPost(id)
      await queueAnnouncementDelivery(pg, id)
    }
    await rows(
      `update announcement_deliveries set updated_time = now() - interval '3 minutes'
       where post_id in ('stalled', 'finished')`
    )
    await rows(
      `update announcement_deliveries set finished_time = now()
       where post_id = 'finished'`
    )

    const results = await resumeStalledAnnouncementDeliveries(pg)

    expect(results.map((r) => r.postId)).toEqual(['stalled'])
    expect((await notificationsFor('stalled')).length).toBe(3)
    expect((await notificationsFor('running')).length).toBe(0)
    expect((await notificationsFor('finished')).length).toBe(0)
  })

  it('fails the run while a send cannot get through, after trying the rest', async () => {
    await addUsers(3)
    for (const id of ['stuck', 'fine']) {
      await addPost(id)
      await queueAnnouncementDelivery(pg, id)
    }
    await rows(
      `update announcement_deliveries set updated_time = now() - interval '3 minutes'`
    )
    // Every insert for 'stuck' fails.
    failStatement = (sql) =>
      insertsIntoNotifications(sql) && sql.includes('"sourceId":"stuck"')

    await expect(
      resumeStalledAnnouncementDeliveries(pg, { retryDelayMs: 0 })
    ).rejects.toThrow('stuck')
    expect((await notificationsFor('stuck')).length).toBe(0)
    expect((await notificationsFor('fine')).length).toBe(3)
    expect((await deliveryOf('stuck')).last_error).toBe(
      'canceling statement due to statement timeout'
    )
  })
})

describe('create-post', () => {
  const admin = {
    id: ADMIN,
    name: 'Gen',
    username: 'Gen',
    avatarUrl: 'https://avatar',
  } as User
  const post = (props: Record<string, unknown>) =>
    (createPost as any)(
      { title: 'Changelog', content: doc('What changed'), ...props },
      { uid: ADMIN },
      {}
    ) as Promise<{
      result: { post: { id: string } }
      continue: () => Promise<void>
    }>

  beforeEach(() => {
    jest
      .mocked(createSupabaseDirectClient)
      .mockReturnValue(pg as ReturnType<typeof createSupabaseDirectClient>)
    jest.mocked(getUser).mockResolvedValue(admin)
  })

  it('queues an announcement with the post and sends it to every user', async () => {
    await addUsers(5)

    const { result, continue: next } = await post({
      isAnnouncement: true,
      isChangeLog: true,
      visibility: 'public',
    })

    // Queued in the post's transaction, before anything is sent.
    expect(await deliveryOf(result.post.id)).toMatchObject({
      sent_count: 0,
      finished_time: null,
    })
    await next()
    expect((await notificationsFor(result.post.id)).length).toBe(5)
    expect((await deliveryOf(result.post.id)).finished_time).not.toBeNull()
    expect(createNewPostFromFollowedUserNotification).not.toHaveBeenCalled()
  })

  it('leaves a resumable delivery if the send never runs', async () => {
    await addUsers(2)

    const { result } = await post({ isAnnouncement: true })
    await rows(
      `update announcement_deliveries set updated_time = now() - interval '3 minutes'`
    )

    await resumeStalledAnnouncementDeliveries(pg)
    expect((await notificationsFor(result.post.id)).length).toBe(2)
  })

  it('notifies followers, not everyone, for an ordinary post', async () => {
    await addUsers(5)

    const { result, continue: next } = await post({ visibility: 'public' })
    await next()

    expect(await deliveryOf(result.post.id)).toBeUndefined()
    expect(createNewPostFromFollowedUserNotification).toHaveBeenCalledTimes(1)
    expect((await notificationsFor(result.post.id)).length).toBe(0)
  })

  it('sends nothing for an unlisted announcement', async () => {
    await addUsers(5)

    const { result, continue: next } = await post({
      isAnnouncement: true,
      visibility: 'unlisted',
    })
    await next()

    expect(await deliveryOf(result.post.id)).toBeUndefined()
    expect(createNewPostFromFollowedUserNotification).not.toHaveBeenCalled()
    expect((await notificationsFor(result.post.id)).length).toBe(0)
  })

  it('sends nothing for a post saved unlisted though asked to be public', async () => {
    await addUsers(5)
    // create-post forces this account's posts to unlisted.
    jest.mocked(getUser).mockResolvedValue({ ...admin, name: 'Rima Akter' })

    const { result, continue: next } = await post({
      isAnnouncement: true,
      visibility: 'public',
    })
    await next()

    expect(await deliveryOf(result.post.id)).toBeUndefined()
    expect(createNewPostFromFollowedUserNotification).not.toHaveBeenCalled()
    expect((await notificationsFor(result.post.id)).length).toBe(0)
  })
})
