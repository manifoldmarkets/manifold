// Reading a market's discussion on Yap, and what happens to a comment that has
// no post there yet, against an in-memory PostgreSQL.
//
// The Yap tables are built by the repository's own migration files, and the
// comments table carries the repository's indexes. The database returns
// timestamps as text, as the API's client does. The read handlers under test
// are the API's own. No live database or network is used.
import { readFileSync } from 'fs'
import { join } from 'path'
import { PGlite } from '@electric-sql/pglite'
import * as pgPromise from 'pg-promise'

// A reply on Yap to a comment's post also writes a market comment. No test
// here lets one get that far: the one reply that is sent is refused first.
jest.mock('api/create-comment', () => ({ newCommentId: () => 'new-comment' }))
jest.mock('api/edit-comment', () => ({}))
jest.mock('api/helpers/rate-limit', () => ({
  onlyUsersWhoCanPerformAction: (_action: string, handler: unknown) => handler,
  throwIfBannedFromAction: jest.fn(),
}))
jest.mock('./websockets/server', () => ({ broadcast: jest.fn() }))
jest.mock('./utils', () => ({
  LOCAL_ONLY: true,
  getUser: jest.fn(),
  getPrivateUser: jest.fn(),
  getContract: jest.fn(),
  revalidateContractStaticProps: jest.fn(async () => undefined),
  log: Object.assign(jest.fn(), { warn: jest.fn(), error: jest.fn() }),
  // Nothing here carries an unsafe link or frame for it to strip.
  sanitizeJsonContent: (content: unknown) => content,
}))
jest.mock('./supabase/init', () => ({ createSupabaseDirectClient: jest.fn() }))
jest.mock('./supabase/entitlements', () => ({
  getActiveSupporterEntitlements: jest.fn(),
}))
jest.mock('./supabase/notifications', () => ({
  insertNotificationToSupabase: jest.fn(),
}))
jest.mock('./analytics', () => ({ trackPublicEvent: jest.fn() }))

import { JSONContent } from '@tiptap/core'
import { Request } from 'express'
import { API } from 'common/api/schema'
import { ContractComment } from 'common/comment'
import { FIREBASE_CONFIG } from 'common/envs/constants'
import {
  SocialPost,
  SocialPostDetail,
  quoteSocialPost,
} from 'common/social-post'
import { SUPPORTER_TIERS } from 'common/supporter-config'
import { PrivateUser, User } from 'common/user'
import { UserEntitlement } from 'common/shop/types'
import { AuthedUser } from 'api/helpers/endpoint'
import {
  createSocialPost,
  editSocialPost,
  getSocialLikers,
  getSocialPost,
  getSocialPosts,
  reactToSocialPost,
  readSocialPosts,
} from 'api/social-posts'
import { setSocialThreadSubscription } from 'api/social-sharing'
import {
  ensureMarketCommentPost,
  ensureSocialSource,
  findPendingCommentPost,
  findSocialPost,
  linkCommentToOpenDiscussion,
  listCardComments,
  listCommentReplies,
  materializeSocialPost,
} from './social-discussion'
import {
  SocialRow,
  SocialViewer,
  hydrateSocialPosts,
  socialReplyCounts,
} from './social-posts'
import { getActiveSupporterEntitlements } from './supabase/entitlements'
import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
} from './supabase/init'
import { getPrivateUser, getUser, log } from './utils'

const pgp = pgPromise()
const MIGRATIONS = join(__dirname, '../../supabase/migrations')
const migration = (name: string) =>
  readFileSync(join(MIGRATIONS, name), 'utf8').replace(/\r\n/g, '\n')

let db: PGlite
let depth = 0
// Every statement sent, in order, while a test is recording them.
let statements: string[] | undefined
// Every statement the database refused because the transaction was read-only,
// noted here before the code that sent it can catch the error.
let refused: string[] = []
const rows = async (sql: string, params?: unknown) => {
  statements?.push(sql)
  try {
    return (await db.query(pgp.as.format(sql, params))).rows as any[]
  } catch (error) {
    if (/read-only transaction/i.test(String(error))) refused.push(sql)
    throw error
  }
}
// The parts of pg-promise the code uses. A transaction inside a transaction
// is a savepoint, as it is in pg-promise.
const client = {
  oneOrNone: async (sql: string, params?: unknown) =>
    (await rows(sql, params))[0] ?? null,
  one: async (sql: string, params?: unknown) => {
    const result = await rows(sql, params)
    if (result.length !== 1) throw new Error('No data returned from the query.')
    return result[0]
  },
  manyOrNone: (sql: string, params?: unknown) => rows(sql, params),
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

// A client that does something once, right after the first of its statements
// that matches (or right before it): what another request does between two
// of this one's looks.
const interleave = (
  pattern: RegExp,
  act: () => Promise<unknown>,
  when: 'after' | 'before' = 'after'
) => {
  let done = false
  const wrap =
    (run: (sql: string, params?: unknown) => Promise<unknown>) =>
    async (sql: string, params?: unknown) => {
      const now = !done && pattern.test(sql)
      if (now) done = true
      if (now && when === 'before') await act()
      const result = await run(sql, params)
      if (now && when === 'after') await act()
      return result
    }
  const interleaved = {
    ...client,
    oneOrNone: wrap(client.oneOrNone),
    one: wrap(client.one),
    manyOrNone: wrap(client.manyOrNone),
    // A transaction of this client runs its statements through it too.
    tx: (fn: (tx: unknown) => Promise<unknown>) =>
      client.tx(() => fn(interleaved)),
  }
  return interleaved as unknown as SupabaseDirectClient
}

// Runs a read with the database refusing every write. A read that tried to
// copy a comment, or to mark one as copied, fails here. So that a write whose
// failure the code caught and carried on from does not pass either, the
// database's refusals are noted where they happen, and every statement the
// read sent is looked at afterwards: none may write or lock.
const readOnly = async <T>(read: () => Promise<T>) => {
  await db.exec('begin transaction read only')
  depth++
  statements = []
  refused = []
  let sent: string[] = []
  try {
    return await read()
  } finally {
    sent = statements ?? []
    statements = undefined
    depth--
    await db.exec('rollback')
    expect(refused).toEqual([])
    expect(
      sent.filter((sql) =>
        /\b(insert\s+into|update\s+\w+\s+set|delete\s+from)\b|\bfor update\b|pg_advisory/i.test(
          sql
        )
      )
    ).toEqual([])
    expect(sent.length).toBeGreaterThan(0)
  }
}

const doc = (...paragraphs: string[]): JSONContent => ({
  type: 'doc',
  content: paragraphs.map((text) => ({
    type: 'paragraph',
    content: [{ type: 'text', text }],
  })),
})
const BASE = 1_700_000_000_000
let clock = 0
const insertComment = async (
  id: string,
  options: {
    contract?: string
    user?: string
    time?: number
    content?: unknown
    data?: Record<string, unknown>
  } = {}
) => {
  const {
    contract = 'market',
    user = 'alice',
    time = BASE + ++clock * 1000,
    content = doc(`comment ${id}`),
    data = {},
  } = options
  await rows(
    `insert into contract_comments (contract_id, comment_id, user_id, created_time, data)
     values ($1, $2, $3, millis_to_ts($4), $5)`,
    [
      contract,
      id,
      user,
      time,
      {
        id,
        userId: user,
        contractId: contract,
        createdTime: time,
        content,
        ...data,
      },
    ]
  )
  return id
}
// Many plain comments at once: <prefix>1 .. <prefix>n, a second apart.
const insertComments = (prefix: string, n: number, reply?: string) =>
  rows(
    `insert into contract_comments (contract_id, comment_id, user_id, created_time, data)
     select 'market', $1 || g, 'alice', millis_to_ts($4 + g * 1000),
       jsonb_strip_nulls(jsonb_build_object('id', $1 || g, 'userId', 'alice', 'contractId', 'market',
         'createdTime', $4 + g * 1000, 'replyToCommentId', $5::text, 'content', $2::jsonb))
     from generate_series(1, $3) g`,
    [prefix, JSON.stringify(doc('hello')), n, BASE, reply ?? null]
  )
const count = async (table: string, where = 'true') =>
  (await rows(`select count(*)::int as n from ${table} where ${where}`))[0]
    .n as number
const stored = async (id: string) =>
  (await rows('select * from social_posts where id=$1', [id]))[0] as
    | SocialRow
    | undefined
const block = (id: string, data: Partial<PrivateUser>) =>
  rows('update private_users set data=$2 where id=$1', [id, data])

const anyone: SocialViewer = { blocked: [] }
const req = {} as Request
const signedIn = (uid: string) => ({ uid } as AuthedUser)
// One page of a post's replies, through the API's own read.
const page = (
  parentId: string,
  viewer: SocialViewer = anyone,
  cursor?: string,
  limit = 30
) =>
  readSocialPosts(
    pg,
    viewer,
    API['get-social-posts'].props.parse({ parentId, cursor, limit })
  )
// Every page of a post's replies, a few at a time.
const all = async (
  parentId: string,
  viewer: SocialViewer = anyone,
  between?: (pageNumber: number) => Promise<unknown>
) => {
  const posts: SocialPost[] = []
  const cursors: string[] = []
  let cursor: string | undefined
  do {
    const next = await page(parentId, viewer, cursor, 7)
    posts.push(...next.posts)
    cursor = next.nextCursor ?? undefined
    if (cursor) {
      expect(cursors).not.toContain(cursor)
      cursors.push(cursor)
      await between?.(cursors.length)
    }
  } while (cursor && cursors.length < 200)
  return posts
}
const open = (id: string, auth?: AuthedUser) =>
  getSocialPost({ id }, auth, req) as Promise<SocialPostDetail>
const ids = (posts: SocialPost[]) => posts.map((post) => post.id)

beforeEach(async () => {
  jest.clearAllMocks()
  depth = 0
  clock = 0
  statements = undefined
  // Timestamps and whole numbers as the API's client returns them.
  db = new PGlite({
    parsers: {
      1114: (value: string) => value,
      1184: (value: string) => value,
      20: (value: string) => parseInt(value, 10),
    },
  })
  // The tables the Yap migrations build on, cut down to the columns and
  // constraints that matter here, with the comments table's own indexes.
  await db.exec(`
    create function millis_to_ts(millis bigint) returns timestamptz language sql immutable as
      $$ select to_timestamp(millis / 1000.0) $$;
    create table users (id text primary key, name text, username text, data jsonb not null default '{}');
    create table user_entitlements (
      user_id text not null, entitlement_id text not null,
      granted_time timestamptz not null default now(), expires_time timestamptz,
      enabled boolean not null default true, auto_renew boolean not null default false,
      metadata jsonb, primary key (user_id, entitlement_id)
    );
    create table contracts (
      id text primary key,
      creator_id text,
      created_time timestamptz not null default now(),
      visibility text not null default 'public',
      data jsonb not null default '{}'
    );
    create table contract_comments (
      contract_id text not null,
      comment_id text not null,
      user_id text not null,
      created_time timestamptz not null,
      data jsonb not null,
      likes integer not null default 0,
      dislikes integer default 0,
      primary key (contract_id, comment_id)
    );
    create index contract_comments_contract_id_created_time_idx on contract_comments using btree (contract_id, created_time desc);
    create index contract_comments_created_time_idx on contract_comments using btree (created_time desc);
    create index contract_comments_id on contract_comments using btree (comment_id);
    create index contract_replies on contract_comments using btree
      (((data ->> 'replyToCommentId'::text)), contract_id, created_time desc);
    create table contract_bets (
      bet_id text primary key,
      contract_id text not null,
      user_id text not null,
      created_time timestamptz not null default now(),
      data jsonb not null default '{}'
    );
    create table posts (id bigint generated always as identity primary key);
    create table user_reactions (
      content_id text not null,
      content_owner_id text not null,
      content_type text not null,
      created_time timestamptz not null default now(),
      reaction_id text not null default md5(random()::text),
      reaction_type text not null default 'like',
      user_id text not null,
      primary key (user_id, reaction_id)
    );
    create index user_reactions_content_id_raw on user_reactions using btree (content_id);
    insert into users (id) values ('owner'), ('alice'), ('bob'), ('carol'), ('dave'), ('erin');
    update users set name = initcap(id), username = id;
    insert into contracts (id, creator_id) values ('market', 'owner'), ('other', 'owner');
    update contracts set data = jsonb_build_object(
      'id', id, 'slug', id, 'creatorUsername', creator_id, 'question', 'Will it?');
    create table private_users (id text primary key, data jsonb not null default '{}');
    insert into private_users (id) select id from users;
  `)
  for (const name of [
    '2026091501_social_posts.sql',
    '2026091601_social_post_images.sql',
    '2026091602_social_post_quotes.sql',
    '2026092101_social_post_rich_content.sql',
    '2026103002_social_post_market_comment.sql',
    '2026111201_social_discussions.sql',
  ])
    await db.exec(migration(name))
  jest
    .mocked(createSupabaseDirectClient)
    .mockReturnValue(pg as ReturnType<typeof createSupabaseDirectClient>)
  jest.mocked(getPrivateUser).mockImplementation(async (id: string) => {
    const [row] = await rows('select data from private_users where id=$1', [id])
    return {
      id,
      blockedUserIds: [],
      blockedByUserIds: [],
      ...row?.data,
    } as PrivateUser
  })
  jest.mocked(getUser).mockImplementation(async (id: string) => {
    const [row] = await rows('select * from users where id=$1', [id])
    return row ? ({ ...row.data, ...row } as User) : null
  })
})
afterEach(() => db.close())

describe('the first read of a long discussion', () => {
  test('returns a complete first page of a market with 250 comments that have no posts, and writes nothing', async () => {
    await insertComments('c', 250)
    await insertComments('r', 3, 'c2')
    const card = await ensureSocialSource(pg, { contractId: 'market' })
    const before = {
      posts: await count('social_posts'),
      comments: (
        await rows(
          'select md5(string_agg(data::text, $1 order by comment_id)) as h from contract_comments',
          ['|']
        )
      )[0].h,
    }

    // A signed-out visitor opens the card: its own post, then its list.
    const { detail, first, second } = await readOnly(async () => ({
      detail: await open(card.id),
      first: await page(card.id),
      second: await page(card.id, anyone, undefined, 30).then((p) =>
        page(card.id, anyone, p.nextCursor!)
      ),
    }))

    expect(detail.post.replyCount).toBe(250)
    expect(ids(first.posts)).toEqual(
      Array.from({ length: 30 }, (_, i) => `mc-c${i + 1}`)
    )
    expect(first.nextCursor).toBeTruthy()
    expect(ids(second.posts)).toEqual(
      Array.from({ length: 30 }, (_, i) => `mc-c${i + 31}`)
    )
    // Each reads as a post: its author, its text, the comment it is, and the
    // replies its market has under it.
    expect(first.posts[1]).toMatchObject({
      id: 'mc-c2',
      marketCommentId: 'c2',
      author: { id: 'alice', username: 'alice' },
      text: 'hello',
      parentId: card.id,
      rootId: card.id,
      removed: null,
      canReply: true,
      likeCount: 0,
      replyCount: 3,
    })
    // Nothing was written: no post, and no comment was marked as on Yap.
    expect(await count('social_posts')).toBe(before.posts)
    expect(
      (
        await rows(
          'select md5(string_agg(data::text, $1 order by comment_id)) as h from contract_comments',
          ['|']
        )
      )[0].h
    ).toBe(before.comments)
    expect(await count('social_thread_subscriptions')).toBe(0)
    expect(log.warn).not.toHaveBeenCalled()
  })

  test('a comment with no post opens as its own page, with what is above it and under it', async () => {
    await insertComment('top', { user: 'bob' })
    await insertComment('reply', {
      user: 'carol',
      data: { replyToCommentId: 'top' },
    })
    const card = await ensureSocialSource(pg, { contractId: 'market' })
    await rows(
      `insert into user_reactions (content_id, content_type, content_owner_id, user_id)
       values ('top', 'comment', 'bob', 'dave'), ('top', 'comment', 'bob', 'erin')`
    )

    const { top, replies, reply, likers } = await readOnly(async () => ({
      top: await open('mc-top', signedIn('dave')),
      replies: await page('mc-top'),
      reply: await open('mc-reply'),
      likers: (await getSocialLikers(
        API['get-social-likers'].props.parse({ id: 'mc-top' }),
        undefined,
        req
      )) as { users: { id: string }[] },
    }))

    expect(ids(top.ancestors)).toEqual([card.id])
    // Likes made on the market are the comment's, with or without a post.
    expect(top.post).toMatchObject({ likeCount: 2, liked: true, replyCount: 1 })
    expect(likers.users.map((user) => user.id).sort()).toEqual(['dave', 'erin'])
    expect(ids(replies.posts)).toEqual(['mc-reply'])
    expect(replies.posts[0]).toMatchObject({
      parentId: 'mc-top',
      rootId: card.id,
      parentAuthor: { id: 'bob' },
    })
    expect(ids(reply.ancestors)).toEqual([card.id, 'mc-top'])
    expect(reply.post.parentAuthor).toMatchObject({ id: 'bob' })
    expect(await count('social_posts')).toBe(1)

    // An id that names no comment on Yap is not found: a comment on a market
    // that has no card, and a comment that does not exist.
    await insertComment('elsewhere', { contract: 'other' })
    await expect(open('mc-elsewhere')).rejects.toMatchObject({ code: 404 })
    await expect(open('mc-nothing')).rejects.toMatchObject({ code: 404 })
    await expect(page('mc-elsewhere')).rejects.toMatchObject({ code: 404 })
  })
})

describe('paging through a discussion', () => {
  // A market whose comments are in every state a list has to deal with.
  const authors = ['alice', 'bob', 'carol', 'dave']
  type Spec = { id: string; user: string; shown: boolean }
  const build = async () => {
    const card = await ensureSocialSource(pg, { contractId: 'market' })
    await rows(
      `insert into contract_bets (bet_id, contract_id, user_id) values ('bet1', 'market', 'carol')`
    )
    const trade = await ensureSocialSource(pg, {
      contractId: 'market',
      betId: 'bet1',
    })
    const specs: Spec[] = []
    for (let i = 1; i <= 120; i++) {
      const id = 't' + String(i).padStart(3, '0')
      const user = authors[i % 4]
      // Two runs of comments written in the same millisecond.
      const time =
        BASE + (i >= 50 && i <= 54 ? 50 : i >= 80 && i <= 83 ? 80 : i) * 1000
      const data: Record<string, unknown> =
        i === 10
          ? { hidden: true, hiderId: 'erin' }
          : i === 11
          ? { deleted: true }
          : i === 12
          ? { isModComment: true }
          : i === 13
          ? { hidden: true, hiderId: 'owner' }
          : i === 30 || i === 31
          ? { betId: 'bet1' }
          : {}
      await insertComment(id, { user, time, data })
      specs.push({ id, user, shown: ![10, 11, 12].includes(i) })
    }
    const spec = (i: number) => specs[i - 1]
    // Every seventh has a post already.
    for (let i = 7; i <= 120; i += 7)
      if (spec(i).shown) await ensureMarketCommentPost(pg, spec(i).id)
    // One was written on Yap, a moment after its comment was.
    await rows(
      `insert into social_posts (id, user_id, text, parent_id, root_id, market_comment_id, source_contract_id, feed_visible, created_time)
       values ('written-on-yap', $2, 'from Yap', $1, $1, 't020', 'market', false, millis_to_ts($3))`,
      [card.id, spec(20).user, BASE + 20 * 1000 + 7]
    )
    // Its author took one off Yap; a moderator hid another there; a third was
    // taken off Yap and still has a reply under it, so it keeps its place.
    await rows(
      `update social_posts set deleted_time=now() where id in ('mc-t014', 'mc-t021')`
    )
    await rows(`update social_posts set hidden_time=now() where id='mc-t028'`)
    spec(14).shown = false
    spec(28).shown = false
    await insertComment('under-t021', {
      user: 'dave',
      time: BASE + 500 * 1000,
      data: { replyToCommentId: 't021' },
    })
    await rows(
      `insert into social_posts (id, user_id, text, parent_id, root_id, market_comment_id, source_contract_id, canonical_key, feed_visible)
       values ('mc-under-t021', 'dave', 'still here', 'mc-t021', $1, 'under-t021', 'market', 'comment:under-t021', false)`,
      [card.id]
    )
    return { card, trade, specs, spec }
  }
  const expected = (specs: Spec[], blocked: string[] = []) =>
    specs
      .filter((spec) => spec.shown && !blocked.includes(spec.user))
      .map((spec) => (spec.id === 't020' ? 'written-on-yap' : 'mc-' + spec.id))
      // The order they were written in, and by id within a millisecond. The
      // one written on Yap sits where its comment does.
      .sort((a, b) => {
        const key = (id: string) => (id === 'written-on-yap' ? 'mc-t020' : id)
        const time = (id: string) => {
          const i = Number(key(id).slice(4))
          return i >= 50 && i <= 54 ? 50 : i >= 80 && i <= 83 ? 80 : i
        }
        return time(a) - time(b) || (key(a) < key(b) ? -1 : 1)
      })

  test('returns every comment once, in order, signed out and signed in, whether or not each has a post', async () => {
    const { card, trade, specs } = await build()
    const signedOut = await all(card.id)
    expect(ids(signedOut)).toEqual(expected(specs))
    expect(new Set(ids(signedOut)).size).toBe(signedOut.length)
    // 117 comments can be shown; two more have posts that are not.
    expect(signedOut).toHaveLength(115)
    // The market's creator hid t013 on the market: that does not reach Yap.
    expect(ids(signedOut)).toContain('mc-t013')
    // A comment on a trade that has its own card sits under that card, and
    // the market's card lists it all the same.
    expect(signedOut.find((post) => post.id === 'mc-t030')).toMatchObject({
      parentId: trade.id,
      rootId: trade.id,
    })
    // Erin has a block with bob: none of his comments, with or without a post.
    const erin: SocialViewer = { id: 'erin', blocked: ['bob'] }
    const forErin = await all(card.id, erin)
    expect(ids(forErin)).toEqual(expected(specs, ['bob']))
    expect(forErin.every((post) => post.author.id !== 'bob')).toBe(true)
    // The number on the card is the number of entries each reader is shown.
    expect((await open(card.id)).post.replyCount).toBe(signedOut.length)
    expect(
      (await socialReplyCounts(pg, [card.id], erin.blocked))[0].count
    ).toBe(forErin.length)
    // The trade's card lists the comments on that trade.
    expect(ids(await all(trade.id))).toEqual(['mc-t030', 'mc-t031'])
    expect((await open(trade.id)).post.replyCount).toBe(2)
  })

  test('a comment that gets its post while a reader pages is neither repeated nor missed', async () => {
    const { card, specs } = await build()
    const want = expected(specs)
    const read = await all(card.id, anyone, async (pageNumber) => {
      // After the second page: one the reader has seen, the next one due, and
      // some further on get their posts. After the fifth, a whole stretch.
      if (pageNumber === 2)
        for (const id of [want[3], want[14], want[15], want[40]])
          await pg.tx((tx) => materializeSocialPost(tx, id))
      if (pageNumber === 5)
        for (const id of want.slice(35, 60))
          if (id.startsWith('mc-'))
            await pg.tx((tx) => materializeSocialPost(tx, id))
    })
    expect(ids(read)).toEqual(want)
    expect(
      await count('social_posts', `market_comment_id is not null`)
    ).toBeGreaterThan(40)
    // And the same list again now that many more have posts.
    expect(ids(await all(card.id))).toEqual(want)
  })

  test("a comment's replies: posts and replies with no post, merged in the order they were written", async () => {
    const card = await ensureSocialSource(pg, { contractId: 'market' })
    await insertComment('top', { user: 'alice', time: BASE })
    await ensureMarketCommentPost(pg, 'top')
    for (let i = 1; i <= 40; i++)
      await insertComment('r' + String(i).padStart(2, '0'), {
        user: authors[i % 4],
        time: BASE + i * 1000,
        data: {
          replyToCommentId: 'top',
          ...(i === 9 ? { hidden: true, hiderId: 'erin' } : {}),
        },
      })
    for (const i of [3, 4, 5, 20, 21, 38])
      await ensureMarketCommentPost(pg, 'r' + String(i).padStart(2, '0'))
    // A reply written on Yap between two of them, with no market comment.
    await rows(
      `insert into social_posts (id, user_id, text, parent_id, root_id, feed_visible, created_time)
       values ('yap-only', 'dave', 'hi', 'mc-top', $1, false, millis_to_ts($2))`,
      [card.id, BASE + 10 * 1000 + 500]
    )
    // A reply written on Yap to r05: on the market it is a reply to the top
    // comment, on Yap it sits under r05 and nowhere else.
    await insertComment('deeper', {
      user: 'carol',
      time: BASE + 6 * 1000 + 1,
      data: { replyToCommentId: 'top' },
    })
    await rows(
      `insert into social_posts (id, user_id, text, parent_id, root_id, market_comment_id, source_contract_id, feed_visible, created_time)
       values ('deeper-post', 'carol', 'deeper', 'mc-r05', $1, 'deeper', 'market', false, millis_to_ts($2))`,
      [card.id, BASE + 6 * 1000 + 3]
    )
    const want = [
      ...Array.from({ length: 10 }, (_, i) => i + 1),
      10.5,
      ...Array.from({ length: 30 }, (_, i) => i + 11),
    ]
      .filter((i) => i !== 9)
      .map((i) =>
        i === 10.5 ? 'yap-only' : 'mc-r' + String(i).padStart(2, '0')
      )

    const replies = await all('mc-top')
    expect(ids(replies)).toEqual(want)
    expect(ids(await all('mc-r05'))).toEqual(['deeper-post'])
    expect((await open('mc-top')).post.replyCount).toBe(want.length)
    // Someone with a block against bob sees neither kind of his replies.
    const erin: SocialViewer = { id: 'erin', blocked: ['bob'] }
    const forErin = await all('mc-top', erin)
    expect(forErin.every((post) => post.author.id !== 'bob')).toBe(true)
    expect(forErin).toHaveLength(
      replies.filter((post) => post.author.id !== 'bob').length
    )
    expect(
      (await socialReplyCounts(pg, ['mc-top'], erin.blocked))[0].count
    ).toBe(forErin.length)
    // Replies get posts while a reader pages: same list.
    const again = await all('mc-top', anyone, async (pageNumber) => {
      if (pageNumber === 1)
        for (const id of ['mc-r02', 'mc-r08', 'mc-r09x', 'mc-r15', 'mc-r30'])
          await pg.tx((tx) => materializeSocialPost(tx, id)).catch(() => null)
    })
    expect(ids(again)).toEqual(want)
  })

  test('a removed card lists nothing, and a closed thread lists its posts but no comments without one', async () => {
    const card = await ensureSocialSource(pg, { contractId: 'market' })
    await insertComment('a')
    await ensureMarketCommentPost(pg, 'a')
    await insertComment('a1', { data: { replyToCommentId: 'a' } })
    await ensureMarketCommentPost(pg, 'a1')
    await insertComment('a2', { data: { replyToCommentId: 'a' } })
    await insertComment('b')
    expect(ids((await page(card.id)).posts)).toEqual(['mc-a', 'mc-b'])
    expect(ids((await page('mc-a')).posts)).toEqual(['mc-a1', 'mc-a2'])

    // Its author takes "a" off Yap: what is on Yap under it stays, and the
    // market's reply that never had a post is no longer part of it.
    await rows(`update social_posts set deleted_time=now() where id='mc-a'`)
    expect(ids((await page('mc-a')).posts)).toEqual(['mc-a1'])
    expect((await open('mc-a')).post.replyCount).toBe(1)
    expect(await findPendingCommentPost(pg, 'a2')).toBeNull()
    await expect(
      pg.tx((tx) => materializeSocialPost(tx, 'mc-a2'))
    ).rejects.toMatchObject({ code: 404 })

    // The market stops being public: its card lists nothing and says so,
    // though "a" and "a1" keep their posts.
    const cardCount = async () => [
      (await open(card.id)).post.replyCount,
      (await socialReplyCounts(pg, [card.id], []))[0].count,
    ]
    expect(ids((await page(card.id)).posts)).toEqual(['mc-a', 'mc-b'])
    expect(await cardCount()).toEqual([2, 2])
    await rows(`update contracts set visibility='unlisted' where id='market'`)
    expect((await page(card.id)).posts).toEqual([])
    expect(await cardCount()).toEqual([0, 0])
    await rows(`update contracts set visibility='public' where id='market'`)
    expect(ids((await page(card.id)).posts)).toEqual(['mc-a', 'mc-b'])
    expect(await cardCount()).toEqual([2, 2])

    // A moderator removes the card, as withdrawLockedPost leaves it. It no
    // longer names its market, so it lists nothing and counts nothing.
    await rows(
      `update social_posts set deleted_time=now(), source_contract_id=null where id=$1`,
      [card.id]
    )
    expect((await page(card.id)).posts).toEqual([])
    expect(await cardCount()).toEqual([0, 0])
    expect(await findPendingCommentPost(pg, 'b')).toBeNull()
  })
})

describe('a comment that has no post yet', () => {
  const image = (name: string) =>
    `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_CONFIG.storageBucket}/o/user-images%2Falice%2F${name}.png?alt=media`

  test('reads exactly as the post it becomes', async () => {
    const card = await ensureSocialSource(pg, { contractId: 'market' })
    await rows(
      `insert into contract_bets (bet_id, contract_id, user_id) values ('bet1', 'market', 'carol')`
    )
    const trade = await ensureSocialSource(pg, {
      contractId: 'market',
      betId: 'bet1',
    })
    await insertComment('plain', { user: 'bob' })
    await insertComment('thread', { user: 'bob' })
    await insertComment('long', { content: doc('y'.repeat(2500)) })
    await insertComment('picture', {
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'look' }] },
          { type: 'image', attrs: { src: image('one') } },
        ],
      },
    })
    await insertComment('mention', {
      user: 'carol',
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'mention', attrs: { id: 'bob', label: 'bob' } },
              { type: 'text', text: ' see https://example.com/a' },
            ],
          },
        ],
      },
    })
    await insertComment('formatted', {
      content: {
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [{ type: 'listItem', content: doc('point').content }],
          },
        ],
      },
    })
    await insertComment('on-trade', { user: 'dave', data: { betId: 'bet1' } })
    await insertComment('reply', {
      user: 'dave',
      data: { replyToCommentId: 'thread' },
    })
    await insertComment('second-reply', {
      user: 'erin',
      data: { replyToCommentId: 'thread' },
    })
    await rows(
      `insert into user_reactions (content_id, content_type, content_owner_id, user_id)
       values ('plain', 'comment', 'bob', 'erin'), ('reply', 'comment', 'dave', 'alice')`
    )
    const erin: SocialViewer = { id: 'erin', blocked: [] }
    const read = async (row: SocialRow, related: SocialRow[] = []) =>
      (await hydrateSocialPosts(pg, [row], erin, true, true, related))[0]

    // The first reply is read under a comment that has no post either, and
    // gives that comment its post too; the second is read under the post.
    for (const id of [
      'reply',
      'second-reply',
      'plain',
      'long',
      'picture',
      'mention',
      'formatted',
      'on-trade',
    ]) {
      const pending = (await findPendingCommentPost(pg, id))!
      expect(pending).toMatchObject({ id: 'mc-' + id, pending: true })
      const above = pending.parent_id?.startsWith('mc-')
        ? (await findSocialPost(pg, pending.parent_id))!
        : undefined
      const before = await read(pending, above ? [above] : [])

      const made = await pg.tx((tx) => materializeSocialPost(tx, 'mc-' + id))
      expect(made.id).toBe('mc-' + id)
      const { pending: _pending, ...row } = pending
      expect(await stored('mc-' + id)).toEqual(row)
      expect(await findPendingCommentPost(pg, id)).toBeNull()
      const after = await read((await stored('mc-' + id))!)
      // What a reader is shown does not change when the post is made.
      expect(after).toEqual(before)
    }
    expect((await stored('mc-on-trade'))!.parent_id).toBe(trade.id)
    expect((await stored('mc-plain'))!.parent_id).toBe(card.id)
    expect((await stored('mc-reply'))!.parent_id).toBe('mc-thread')
    expect((await stored('mc-thread'))!.parent_id).toBe(card.id)
    expect([...(await stored('mc-long'))!.text]).toHaveLength(2000)
    expect((await stored('mc-picture'))!.image_urls).toEqual([image('one')])
    // None of the five people chose to follow anything.
    expect(await count('social_thread_subscriptions')).toBe(0)
  })

  test('is not listed, counted or given a post when it could never be copied', async () => {
    const card = await ensureSocialSource(pg, { contractId: 'market' })
    await rows(
      `insert into contract_bets (bet_id, contract_id, user_id) values ('bet1', 'market', 'carol')`
    )
    const trade = await ensureSocialSource(pg, {
      contractId: 'market',
      betId: 'bet1',
    })
    // Bob has a block with the market's creator; dave with carol, whose trade
    // has a card; erin's row says the market's creator blocked her.
    await block('bob', { blockedUserIds: ['owner'] })
    await block('dave', { blockedUserIds: ['carol'] })
    await block('erin', { blockedByUserIds: ['owner'] })
    await insertComment('fine')
    await insertComment('mod', { data: { isModComment: true } })
    await insertComment('hidden', { data: { hidden: true, hiderId: 'erin' } })
    await insertComment('deleted', { data: { deleted: true } })
    await insertComment('blocked', { user: 'bob' })
    await insertComment('blocked-by', { user: 'erin' })
    await insertComment('trade-blocked', {
      user: 'dave',
      data: { betId: 'bet1' },
    })
    await insertComment('trade-fine', {
      user: 'alice',
      data: { betId: 'bet1' },
    })
    // Dave has no block with the market's creator: off the trade he is fine.
    await insertComment('dave-fine', { user: 'dave' })
    await insertComment('no-content', { content: null })
    await insertComment('text-content', { content: 'just text' })
    await insertComment('under-hidden', {
      data: { replyToCommentId: 'hidden' },
    })
    await insertComment('under-mod', { data: { replyToCommentId: 'mod' } })
    await insertComment('under-blocked', {
      data: { replyToCommentId: 'blocked' },
    })
    await insertComment('under-fine', {
      user: 'bob',
      data: { replyToCommentId: 'fine' },
    })
    const never = [
      'mod',
      'hidden',
      'deleted',
      'blocked',
      'blocked-by',
      'trade-blocked',
      'no-content',
      'text-content',
      'under-hidden',
      'under-mod',
      'under-blocked',
      'under-fine',
    ]

    const listed = ids(await all(card.id))
    expect(listed).toEqual(['mc-fine', 'mc-trade-fine', 'mc-dave-fine'])
    expect((await open(card.id)).post.replyCount).toBe(3)
    expect(ids(await all(trade.id))).toEqual(['mc-trade-fine'])
    expect((await open(trade.id)).post.replyCount).toBe(1)
    expect((await page('mc-fine')).posts).toEqual([])
    expect((await open('mc-fine')).post.replyCount).toBe(0)
    for (const id of never) {
      expect(await findPendingCommentPost(pg, id)).toBeNull()
      await expect(open('mc-' + id)).rejects.toMatchObject({ code: 404 })
      await expect(
        pg.tx((tx) => materializeSocialPost(tx, 'mc-' + id))
      ).rejects.toMatchObject({ code: 404 })
    }
    expect(await count('social_posts')).toBe(2)
    // Nothing was tried and refused.
    expect(log.warn).not.toHaveBeenCalled()

    // The same for every comment of a market that stops being public.
    const other = await ensureSocialSource(pg, { contractId: 'other' })
    await insertComment('unlisted', { contract: 'other' })
    expect(ids((await page(other.id)).posts)).toEqual(['mc-unlisted'])
    await rows(`update contracts set visibility='unlisted' where id='other'`)
    expect((await page(other.id)).posts).toEqual([])
    expect(await findPendingCommentPost(pg, 'unlisted')).toBeNull()

    // What could not be shown can be once the reason is gone: a moderator
    // unhides one, and a block is lifted.
    await rows(
      `update contract_comments set data = data || '{"hidden": false}' where comment_id='hidden'`
    )
    await block('bob', {})
    expect(ids(await all(card.id))).toEqual([
      'mc-fine',
      'mc-hidden',
      'mc-blocked',
      'mc-trade-fine',
      'mc-dave-fine',
    ])
    expect(ids((await page('mc-fine')).posts)).toEqual(['mc-under-fine'])
  })

  test('is not listed, counted or given a post while the card of its trade is closed', async () => {
    // No request hides a trade's card today: removing one takes its market
    // off it, and its comments then sit under the market's card. If a
    // trade's card is closed and still names its market, its comments have
    // no place on Yap, and the market's card does not take them instead.
    const card = await ensureSocialSource(pg, { contractId: 'market' })
    await rows(
      `insert into contract_bets (bet_id, contract_id, user_id) values ('bet1', 'market', 'carol')`
    )
    const tradeCard = await ensureSocialSource(pg, {
      contractId: 'market',
      betId: 'bet1',
    })
    await insertComment('plain', { user: 'bob' })
    await insertComment('onTrade', { user: 'bob', data: { betId: 'bet1' } })
    expect(ids((await page(card.id)).posts)).toEqual(['mc-plain', 'mc-onTrade'])
    expect((await open(card.id)).post.replyCount).toBe(2)

    await rows(`update social_posts set hidden_time=now() where id=$1`, [
      tradeCard.id,
    ])
    expect(ids((await page(card.id)).posts)).toEqual(['mc-plain'])
    expect((await open(card.id)).post.replyCount).toBe(1)
    expect(await findSocialPost(pg, 'mc-onTrade')).toBeNull()
    await expect(
      pg.tx((tx) => materializeSocialPost(tx, 'mc-onTrade'))
    ).rejects.toMatchObject({ code: 404 })
    expect(await stored('mc-onTrade')).toBeUndefined()
  })
})

describe('a comment whose author has no account row', () => {
  test('is not shown and gets no post; the count alone still includes it', async () => {
    // A copy belongs to an account, so this comment could never have one.
    // The lists look each author up and leave it out. The count does not
    // look authors up, to stay one pass over the comments, and is one over.
    const card = await ensureSocialSource(pg, { contractId: 'market' })
    await insertComment('fine')
    await insertComment('no-author', { user: 'nobody' })
    await insertComment('fine-reply', { data: { replyToCommentId: 'fine' } })
    await insertComment('no-author-reply', {
      user: 'nobody',
      data: { replyToCommentId: 'fine' },
    })
    expect(ids(await all(card.id))).toEqual(['mc-fine'])
    expect(ids(await all('mc-fine'))).toEqual(['mc-fine-reply'])
    for (const id of ['no-author', 'no-author-reply']) {
      expect(await findPendingCommentPost(pg, id)).toBeNull()
      await expect(open('mc-' + id)).rejects.toMatchObject({ code: 404 })
      await expect(
        pg.tx((tx) => materializeSocialPost(tx, 'mc-' + id))
      ).rejects.toMatchObject({ code: 404 })
    }
    expect((await open(card.id)).post.replyCount).toBe(2)
    expect((await open('mc-fine')).post.replyCount).toBe(2)
    expect(await count('social_posts')).toBe(1)
  })
})

describe('acting on a comment that has no post yet', () => {
  let card: SocialRow
  beforeEach(async () => {
    card = await ensureSocialSource(pg, { contractId: 'market' })
    await insertComment('c1', { user: 'bob' })
    await insertComment('c2', { user: 'bob' })
    await insertComment('c3', { user: 'bob' })
    await insertComment('c4', { user: 'bob' })
    await insertComment('c4r', {
      user: 'carol',
      data: { replyToCommentId: 'c4' },
    })
  })

  test('a like on Yap gives it its post; taking back a like made on the market does not', async () => {
    await reactToSocialPost(
      API.react.props.parse({ contentId: 'mc-c1', contentType: 'social_post' }),
      signedIn('dave'),
      req
    )
    expect(await stored('mc-c1')).toMatchObject({
      parent_id: card.id,
      root_id: card.id,
      user_id: 'bob',
      market_comment_id: 'c1',
    })
    // The like is the comment's own, so the market shows it too.
    expect(
      await rows(
        `select content_type, content_id, user_id from user_reactions order by 1`
      )
    ).toEqual([{ content_type: 'comment', content_id: 'c1', user_id: 'dave' }])
    expect((await open('mc-c1', signedIn('dave'))).post).toMatchObject({
      likeCount: 1,
      liked: true,
    })

    // Erin liked c2 on its market. On Yap she sees her like and takes it back.
    await rows(
      `insert into user_reactions (content_id, content_type, content_owner_id, user_id)
       values ('c2', 'comment', 'bob', 'erin')`
    )
    expect((await open('mc-c2', signedIn('erin'))).post.liked).toBe(true)
    await reactToSocialPost(
      API.react.props.parse({
        contentId: 'mc-c2',
        contentType: 'social_post',
        remove: true,
      }),
      signedIn('erin'),
      req
    )
    expect(await count('user_reactions', `content_id='c2'`)).toBe(0)
    expect(await stored('mc-c2')).toBeUndefined()
    // Bob wrote the comments and chose nothing on Yap.
    expect(await count('social_thread_subscriptions')).toBe(0)
  })

  test('someone with a block against its author cannot like it or follow from it, and the refusal leaves no post', async () => {
    await block('dave', { blockedUserIds: ['bob'] })
    await expect(
      reactToSocialPost(
        API.react.props.parse({
          contentId: 'mc-c1',
          contentType: 'social_post',
        }),
        signedIn('dave'),
        req
      )
    ).rejects.toMatchObject({ code: 403 })
    await expect(
      setSocialThreadSubscription(
        API['set-social-thread-subscription'].props.parse({
          id: 'mc-c1',
          muted: false,
        }),
        signedIn('dave'),
        req
      )
    ).rejects.toMatchObject({ code: 403 })
    expect(await stored('mc-c1')).toBeUndefined()
    expect(await count('user_reactions')).toBe(0)
    expect(await count('social_thread_subscriptions')).toBe(0)
    expect(
      (
        await rows(
          `select data ? 'socialPostId' as marked from contract_comments where comment_id='c1'`
        )
      )[0].marked
    ).toBe(false)
  })

  test('sharing it, replying to it on its market, or following its thread gives it its post', async () => {
    // A re-Yap or a quote names the post by its id.
    const shared = await pg.tx((tx) =>
      ensureSocialSource(
        tx as SupabaseDirectClient,
        { postId: 'mc-c3' },
        {
          id: 'dave',
          blocked: [],
        }
      )
    )
    expect(shared).toMatchObject({ id: 'mc-c3', parent_id: card.id })

    // A reply written on the market under c2, which has no post: both get
    // one, so the people following the thread on Yap hear of the reply.
    await insertComment('c2r', {
      user: 'carol',
      data: { replyToCommentId: 'c2' },
    })
    const joined = await linkCommentToOpenDiscussion(pg, {
      id: 'c2r',
      contractId: 'market',
      replyToCommentId: 'c2',
    } as ContractComment)
    expect(joined).toMatchObject({
      parent: { id: 'mc-c2' },
      row: { id: 'mc-c2r', parent_id: 'mc-c2', root_id: card.id },
    })
    expect((await stored('mc-c2'))!.parent_id).toBe(card.id)

    // Following from a reply is an action on it like any other: the reply
    // and the comment above it get their posts, and Erin follows their
    // thread. The comments' authors follow nothing.
    await setSocialThreadSubscription(
      API['set-social-thread-subscription'].props.parse({
        id: 'mc-c4r',
        muted: false,
      }),
      signedIn('erin'),
      req
    )
    expect(
      await rows(
        'select root_id, user_id, muted from social_thread_subscriptions'
      )
    ).toEqual([{ root_id: card.id, user_id: 'erin', muted: false }])
    expect(await stored('mc-c4')).toMatchObject({
      parent_id: card.id,
      user_id: 'bob',
    })
    expect(await stored('mc-c4r')).toMatchObject({
      parent_id: 'mc-c4',
      root_id: card.id,
      user_id: 'carol',
    })
    expect((await open('mc-c4', signedIn('erin'))).post.threadFollowing).toBe(
      true
    )

    // A comment on a market that has no card is not on Yap, and its id
    // cannot be used to put it there.
    await insertComment('elsewhere', { contract: 'other' })
    await expect(
      pg.tx((tx) => materializeSocialPost(tx, 'mc-elsewhere'))
    ).rejects.toMatchObject({ code: 404 })
    await insertComment('elsewhere-reply', {
      contract: 'other',
      data: { replyToCommentId: 'elsewhere' },
    })
    expect(
      await linkCommentToOpenDiscussion(pg, {
        id: 'elsewhere-reply',
        contractId: 'other',
        replyToCommentId: 'elsewhere',
      } as ContractComment)
    ).toBeNull()
    expect(await count('social_posts', `source_contract_id='other'`)).toBe(0)
  })

  test('following from a comment has an hourly allowance, as a like has', async () => {
    const follow = (id: string) =>
      setSocialThreadSubscription(
        API['set-social-thread-subscription'].props.parse({ id, muted: false }),
        signedIn('erin'),
        req
      )
    // Erin has used this hour's allowance up.
    await rows(
      `insert into social_write_limits (user_id, action, count) values ('erin', 'follow', 300)`
    )
    await expect(follow('mc-c1')).rejects.toMatchObject({ code: 429 })
    expect(await stored('mc-c1')).toBeUndefined()
    expect(await count('social_thread_subscriptions')).toBe(0)
    // Following from a post that is not a comment's writes no post and has
    // no allowance, as before.
    await follow(card.id)
    expect(
      await rows('select root_id, user_id from social_thread_subscriptions')
    ).toEqual([{ root_id: card.id, user_id: 'erin' }])
  })

  test("what a refused share is told goes by the sharer's blocks as they are now", async () => {
    // Bob took his comment off Yap. Sharing it from the market is refused,
    // and a sharer who has no block with him is told why. Dave's request
    // read his blocks before Bob blocked him: he is told only that the
    // discussion is closed, as anyone with a block is.
    await ensureMarketCommentPost(pg, 'c1')
    await rows(`update social_posts set deleted_time=now() where id='mc-c1'`)
    const share = (sharer: SocialViewer) =>
      pg.tx((tx) =>
        ensureSocialSource(
          tx as SupabaseDirectClient,
          { contractId: 'market', commentId: 'c1' },
          sharer
        )
      )
    await expect(share({ id: 'erin', blocked: [] })).rejects.toMatchObject({
      code: 403,
      message: "This comment's author took it off Yap",
    })
    await block('dave', { blockedByUserIds: ['bob'] })
    await expect(share({ id: 'dave', blocked: [] })).rejects.toMatchObject({
      code: 403,
      message: 'This discussion is closed',
    })
  })

  test('a deleted account cannot follow from a comment, which could give the comment its post', async () => {
    const follow = (id: string) =>
      setSocialThreadSubscription(
        API['set-social-thread-subscription'].props.parse({ id, muted: false }),
        signedIn('erin'),
        req
      )
    await rows(
      `update users set data = data || '{"userDeleted":true}' where id='erin'`
    )
    await expect(follow('mc-c1')).rejects.toMatchObject({ code: 403 })
    expect(await stored('mc-c1')).toBeUndefined()
    expect(await count('social_thread_subscriptions')).toBe(0)
    // From a post that is not a comment's, a follow is as it was.
    await follow(card.id)
    expect(await count('social_thread_subscriptions')).toBe(1)
  })

  test('a lookup by ids returns posts only; the comment is read on its own page', async () => {
    // The lookup by ids takes fifty at once and finding a comment's place
    // takes several lookups, so it stays one statement, as it was. A comment
    // without a post is read through its thread or its own page.
    await ensureMarketCommentPost(pg, 'c1')
    statements = []
    const found = (await getSocialPosts(
      API['get-social-posts'].props.parse({
        ids: ['mc-c1', 'mc-c2', 'mc-c4r', 'mc-nothing', card.id],
      }),
      undefined,
      req
    )) as { posts: SocialPost[] }
    const sent = statements
    statements = undefined
    expect(ids(found.posts).sort()).toEqual([card.id, 'mc-c1'].sort())
    // No comment was looked up for its place on Yap.
    expect(sent.some((sql) => /where cc\.comment_id=\$1 and/.test(sql))).toBe(
      false
    )
    expect((await open('mc-c2')).post.id).toBe('mc-c2')
    expect((await open('mc-c4r')).post).toMatchObject({
      id: 'mc-c4r',
      parentId: 'mc-c4',
      parentAuthor: { id: 'bob' },
    })
    expect(await count('social_posts')).toBe(2)
  })

  test('a quote gives it its post, and a quote that is refused leaves none', async () => {
    jest
      .mocked(getActiveSupporterEntitlements)
      .mockResolvedValue([
        { entitlementId: SUPPORTER_TIERS.basic.id, enabled: true },
      ] as UserEntitlement[])
    const quote = (uid: string, postId: string) =>
      createSocialPost(
        API['create-social-post'].props.parse({
          content: { text: 'look at this', marketIds: [] },
          source: { postId },
        }),
        signedIn(uid),
        req
      )
    // Dave has a block with the comment's author, so he cannot quote it. The
    // refusal undoes the copy with the quote: nothing is left on Yap, and the
    // comment is not marked as being there.
    await block('dave', { blockedUserIds: ['bob'] })
    await expect(quote('dave', 'mc-c1')).rejects.toMatchObject({ code: 403 })
    expect(await stored('mc-c1')).toBeUndefined()
    expect(await count('social_posts')).toBe(1)
    expect(
      (
        await rows(
          `select data ? 'socialPostId' as marked from contract_comments where comment_id='c1'`
        )
      )[0].marked
    ).toBe(false)

    // Erin's quote goes through, and the comment gets its post under the card.
    await quote('erin', 'mc-c1')
    expect(await stored('mc-c1')).toMatchObject({
      parent_id: card.id,
      user_id: 'bob',
    })
    expect(
      await rows(
        `select user_id, source_post_id from social_posts where source_post_id is not null`
      )
    ).toEqual([{ user_id: 'erin', source_post_id: 'mc-c1' }])
  })

  test("a like and its taking back both ask for the comment's lock before the like allowance's", async () => {
    // Asked for in two orders, the two requests of one person could each
    // hold what the other waits for.
    const order = async (remove: boolean) => {
      statements = []
      await reactToSocialPost(
        API.react.props.parse({
          contentId: 'mc-c1',
          contentType: 'social_post',
          remove,
        }),
        signedIn('dave'),
        req
      )
      const sent = statements
      statements = undefined
      return [
        sent.findIndex((sql) =>
          /from contract_comments\b[^;]*\bfor update/.test(sql)
        ),
        sent.findIndex((sql) => /insert into social_write_limits/.test(sql)),
      ]
    }
    // Taking back a like made on the market, while the comment has no post.
    await rows(
      `insert into user_reactions (content_id, content_type, content_owner_id, user_id)
       values ('c1', 'comment', 'bob', 'dave')`
    )
    const [lockedForUnlike, allowanceForUnlike] = await order(true)
    expect(await stored('mc-c1')).toBeUndefined()
    expect(await count('user_reactions')).toBe(0)
    expect(lockedForUnlike).toBeGreaterThanOrEqual(0)
    expect(lockedForUnlike).toBeLessThan(allowanceForUnlike)
    // A like, which gives the comment its post.
    const [lockedForLike, allowanceForLike] = await order(false)
    expect(await stored('mc-c1')).toBeDefined()
    expect(lockedForLike).toBeGreaterThanOrEqual(0)
    expect(lockedForLike).toBeLessThan(allowanceForLike)
  })
})

describe('a comment that gets its post between two looks', () => {
  let card: SocialRow
  beforeEach(async () => {
    card = await ensureSocialSource(pg, { contractId: 'market' })
    await insertComment('x', { user: 'bob' })
    await insertComment('xr', {
      user: 'carol',
      data: { replyToCommentId: 'x' },
    })
  })
  const postById = /^select \* from social_posts where id=\$1$/
  const repliedToPost =
    /^select s\.\* from social_posts s join contract_comments cc/

  test('is found by the reader, and by someone acting on it', async () => {
    // The look for a post misses; then someone else gives the comment its
    // post; the look for a comment without one misses too. A last look finds
    // it. Without that the reader, or the second of two people acting at the
    // same moment, would be told there is no such post.
    const read = await findSocialPost(
      interleave(postById, () => ensureMarketCommentPost(pg, 'x')),
      'mc-x'
    )
    expect(read).toMatchObject({ id: 'mc-x', parent_id: card.id })
    expect(read?.pending).toBeUndefined()

    await insertComment('y', { user: 'bob' })
    const acted = await materializeSocialPost(
      interleave(postById, () => ensureMarketCommentPost(pg, 'y')),
      'mc-y'
    )
    expect(acted).toMatchObject({ id: 'mc-y', parent_id: card.id })
    expect(await count('social_posts', `market_comment_id='y'`)).toBe(1)
  })

  test('still has its replies under it', async () => {
    // The same, for the comment a reply sits under.
    const reply = await findPendingCommentPost(
      interleave(repliedToPost, () => ensureMarketCommentPost(pg, 'x')),
      'xr'
    )
    expect(reply).toMatchObject({
      id: 'mc-xr',
      parent_id: 'mc-x',
      pending: true,
    })
  })

  test('shows the number of replies it has, whichever of them have posts by then', async () => {
    // A page chose "x" while it had no post. Before its replies are counted,
    // someone likes its reply, which gives both their posts.
    const [entry] = await listCardComments(pg, card, anyone, undefined, 10)
    expect(entry.pending).toMatchObject({ id: 'mc-x', pending: true })
    await insertComment('xr2', {
      user: 'dave',
      data: { replyToCommentId: 'x' },
    })
    await pg.tx((tx) => materializeSocialPost(tx, 'mc-xr'))
    expect(await stored('mc-x')).toBeDefined()
    const [post] = await hydrateSocialPosts(pg, [entry.pending!], anyone)
    // One reply with a post and one without: two, each counted once.
    expect(post.replyCount).toBe(2)
    expect(ids((await page('mc-x')).posts)).toEqual(['mc-xr', 'mc-xr2'])
  })

  test('gets none if its card is removed in between', async () => {
    // The comment is found on Yap under its market's card; a moderator then
    // removes the card; then the copy would be made. It is not: with no
    // place in a discussion the comment would become a post of its own, as
    // if someone had shared it.
    const removeCard = () =>
      rows(
        `update social_posts set deleted_time=now(), source_contract_id=null where id=$1`,
        [card.id]
      )
    await expect(
      materializeSocialPost(
        interleave(/canonical_key in \(\$2,\$3\)/, removeCard),
        'mc-x'
      )
    ).rejects.toMatchObject({ code: 404 })
    expect(await count('social_posts', 'market_comment_id is not null')).toBe(0)
    // The same for a comment written on the market a moment after. That is
    // no failure: the comment stays on its market and joins no discussion.
    await rows(
      `update social_posts set deleted_time=null, source_contract_id='market' where id=$1`,
      [card.id]
    )
    expect(
      await linkCommentToOpenDiscussion(
        interleave(/canonical_key in \(\$2,\$3\)/, removeCard),
        { id: 'x', contractId: 'market' } as ContractComment
      )
    ).toBeNull()
    expect(await count('social_posts', 'market_comment_id is not null')).toBe(0)
  })

  test('takes no reply written after it was taken off Yap, though the read began before', async () => {
    // A reader's list of the replies under "x" has read the first post of
    // the thread. Before it reads the replies, the author of "x" takes it
    // off Yap, which gives it its post and withdraws it, and then someone
    // replies to "x" on its market. That reply never had a place on Yap.
    const chosen = (await findSocialPost(pg, 'mc-x'))!
    expect(chosen.pending).toBe(true)
    const withdrawThenReply = async () => {
      await ensureMarketCommentPost(pg, 'x')
      await rows(`update social_posts set deleted_time=now() where id='mc-x'`)
      await insertComment('late', {
        user: 'dave',
        data: { replyToCommentId: 'x' },
      })
    }
    // That is the list's first read of a post by its id.
    const listed = await listCommentReplies(
      interleave(
        /^select \* from social_posts where id = \$1$/,
        withdrawThenReply
      ),
      chosen,
      anyone,
      undefined,
      10
    )
    expect(await count('contract_comments', `comment_id='late'`)).toBe(1)
    expect(listed).toEqual([])
    // Nor is it counted for a page that chose "x" before.
    const [post] = await hydrateSocialPosts(pg, [chosen], anyone)
    expect(post.replyCount).toBe(0)
  })

  test('a card removed after the read began lists nothing, as it will the next time', async () => {
    // The card was read, then a moderator removed it. The list is asked with
    // the card as it was read, and finds in the same statement that the card
    // no longer names the market. That holds for a comment on a trade that
    // has a card of its own too: it sits under the trade's card, which is
    // still there, but it is this card's list that is being read.
    await rows(
      `insert into contract_bets (bet_id, contract_id, user_id) values ('bet1', 'market', 'carol')`
    )
    await ensureSocialSource(pg, { contractId: 'market', betId: 'bet1' })
    await ensureMarketCommentPost(pg, 'x')
    await insertComment('z', { user: 'bob' })
    await insertComment('onTrade', { user: 'bob', data: { betId: 'bet1' } })
    const asRead = { ...card }
    expect(ids(await all(card.id))).toEqual(['mc-x', 'mc-z', 'mc-onTrade'])
    await rows(
      `update social_posts set deleted_time=now(), source_contract_id=null where id=$1`,
      [card.id]
    )
    expect(await listCardComments(pg, asRead, anyone, undefined, 10)).toEqual(
      []
    )
    expect((await page(card.id)).posts).toEqual([])
  })

  test('a card hidden after the read began lists none of the comments in its thread, with or without a post', async () => {
    // The card was read, then a moderator hid it. The list is asked with the
    // card as it was read, and asks in the same statement whether the card
    // still takes comments. It does not: "z", which has no post, is not
    // shown, and neither is "x", which has one under the hidden card. A
    // comment on a trade that has a card of its own is in that card's
    // thread, which is open: it is still listed, as its post would have been
    // before reads stopped making copies.
    await rows(
      `insert into contract_bets (bet_id, contract_id, user_id) values ('bet1', 'market', 'carol')`
    )
    await ensureSocialSource(pg, { contractId: 'market', betId: 'bet1' })
    await ensureMarketCommentPost(pg, 'x')
    await insertComment('z', { user: 'bob' })
    await insertComment('onTrade', { user: 'bob', data: { betId: 'bet1' } })
    const asRead = { ...card }
    expect(ids(await all(card.id))).toEqual(['mc-x', 'mc-z', 'mc-onTrade'])
    await rows(`update social_posts set hidden_time=now() where id=$1`, [
      card.id,
    ])
    expect(
      (await listCardComments(pg, asRead, anyone, undefined, 10)).map(
        (entry) => entry.id
      )
    ).toEqual(['mc-onTrade'])
  })

  test('takes no reply written after its comment was deleted on the market, though the read began before', async () => {
    // "x" has its post. A reader's list of its replies has looked up which
    // market the comment is on. Before it reads the replies, the bulk spam
    // tool deletes the comment there, which leaves its post on Yap alone, and
    // then someone replies to it on the market. That reply has no place on Yap.
    await ensureMarketCommentPost(pg, 'x')
    const post = (await stored('mc-x'))!
    const deleteThenReply = async () => {
      await rows(
        `update contract_comments set data=data || '{"deleted":true}' where comment_id='x'`
      )
      await insertComment('late', {
        user: 'dave',
        data: { replyToCommentId: 'x' },
      })
    }
    // The look at the comment is the one that asks for its market.
    const listed = await listCommentReplies(
      interleave(
        /^select cc\.contract_id from contract_comments cc join social_posts s/,
        deleteThenReply
      ),
      post,
      anyone,
      undefined,
      10
    )
    expect(await count('contract_comments', `comment_id='late'`)).toBe(1)
    expect(listed).toEqual([])

    // The same for a comment chosen for a page while it had no post.
    await insertComment('y', { user: 'bob' })
    const chosen = (await findSocialPost(pg, 'mc-y'))!
    await rows(
      `update contract_comments set data=data || '{"deleted":true}' where comment_id='y'`
    )
    await insertComment('lateToo', {
      user: 'dave',
      data: { replyToCommentId: 'y' },
    })
    const [hydrated] = await hydrateSocialPosts(pg, [chosen], anyone)
    expect(hydrated.replyCount).toBe(0)
    expect(await listCommentReplies(pg, chosen, anyone, undefined, 10)).toEqual(
      []
    )
  })

  const followFrom = (id: string, uid = 'erin') =>
    setSocialThreadSubscription(
      API['set-social-thread-subscription'].props.parse({ id, muted: false }),
      signedIn(uid),
      req
    )
  const like = (id: string, uid: string, remove = false) =>
    reactToSocialPost(
      API.react.props.parse({
        contentId: id,
        contentType: 'social_post',
        remove,
      }),
      signedIn(uid),
      req
    )
  // The client the next requests get. `whileARequestRuns` has another request
  // do something right before (or right after) the first of their statements
  // that matches. This database has one connection, so when the request is
  // then refused, its rollback also undoes what the other request did: a test
  // that goes on from there does it again.
  const use = (next: SupabaseDirectClient) =>
    jest
      .mocked(createSupabaseDirectClient)
      .mockReturnValue(next as ReturnType<typeof createSupabaseDirectClient>)
  const whileARequestRuns = (
    pattern: RegExp,
    act: () => Promise<unknown>,
    when: 'after' | 'before' = 'before'
  ) => use(interleave(pattern, act, when))
  // A client that notes each transaction the next requests begin and each
  // thread lock they ask for, in order.
  const watchingThreadLocks = () => {
    const asked: string[] = []
    const watched = {
      ...client,
      one: async (sql: string, params?: unknown) => {
        if (/pg_advisory_xact_lock/.test(sql))
          asked.push(String((params as string[])[0]))
        return client.one(sql, params)
      },
      tx: (fn: (tx: unknown) => Promise<unknown>) => {
        asked.push('begin')
        return client.tx(() => fn(watched))
      },
    }
    use(watched as unknown as SupabaseDirectClient)
    return asked
  }
  const subscriptions = () =>
    rows('select root_id, user_id from social_thread_subscriptions')
  const marked = async (commentId: string) =>
    (
      await rows(
        `select data ? 'socialPostId' as marked from contract_comments where comment_id=$1`,
        [commentId]
      )
    )[0].marked as boolean
  const tradeWithAComment = async (...commentIds: string[]) => {
    await rows(
      `insert into contract_bets (bet_id, contract_id, user_id) values ('bet1', 'market', 'carol')`
    )
    for (const id of commentIds)
      await insertComment(id, { user: 'bob', data: { betId: 'bet1' } })
  }
  const makeTradeCard = () =>
    ensureSocialSource(pg, { contractId: 'market', betId: 'bet1' })
  const removeCard = (id: string) =>
    rows(
      `update social_posts set deleted_time=now(), source_contract_id=null where id=$1`,
      [id]
    )

  test('cannot be followed from once it has been taken off Yap, though the request began before', async () => {
    // Erin asks to follow from "x" while it has no post, as its author is
    // taking it off Yap. Following gives the comment its post, and that asks
    // for the comment's lock first, which the removal holds. So her request
    // goes on when the removal is done: the post is there by then, closed,
    // and she is refused as for any closed post.
    whileARequestRuns(/for update of cc/, async () => {
      await ensureMarketCommentPost(pg, 'x')
      await rows(`update social_posts set deleted_time=now() where id='mc-x'`)
    })
    await expect(followFrom('mc-x')).rejects.toMatchObject({ code: 403 })
    expect(await subscriptions()).toEqual([])

    // A moderator removes the market's card while a request to follow from
    // another comment under it waits for the lock of the card's thread. With
    // the lock the card is looked for again: the comment has no place on Yap
    // any more, and it gets no post.
    await insertComment('y', { user: 'bob' })
    whileARequestRuns(/pg_advisory_xact_lock/, () => removeCard(card.id))
    await expect(followFrom('mc-y')).rejects.toMatchObject({ code: 404 })
    expect(await stored('mc-y')).toBeUndefined()
    expect(await marked('y')).toBe(false)
    expect(await subscriptions()).toEqual([])
  })

  test("a follow gives the comment its post, asking for the comment's lock before its thread's and for no second thread", async () => {
    const asked = watchingThreadLocks()
    statements = []
    await followFrom('mc-xr')
    const sent = statements
    statements = undefined
    // "xr" replies to "x", and neither had a post: both get one. Each
    // comment's lock is asked for before any thread's.
    const commentLocks = sent.flatMap((sql, at) =>
      /for update of cc/.test(sql) ? [at] : []
    )
    const threadLocks = sent.flatMap((sql, at) =>
      /pg_advisory_xact_lock/.test(sql) ? [at] : []
    )
    expect(commentLocks).toHaveLength(2)
    expect(Math.max(...commentLocks)).toBeLessThan(Math.min(...threadLocks))
    // The follow's hourly allowance is asked for after both, as a like's is.
    expect(Math.max(...threadLocks)).toBeLessThan(
      sent.findIndex((sql) => /insert into social_write_limits/.test(sql))
    )
    // One transaction, and one thread in it, the card's: asked for when each
    // of the two posts is made and again by the follow itself.
    expect(asked.filter((entry) => entry === 'begin')).toHaveLength(1)
    expect([...new Set(asked.filter((entry) => entry !== 'begin'))]).toEqual([
      `social:${card.id}`,
    ])
    expect(await stored('mc-x')).toMatchObject({ parent_id: card.id })
    expect(await stored('mc-xr')).toMatchObject({
      parent_id: 'mc-x',
      root_id: card.id,
    })
    // Erin follows the thread. The comments' authors chose nothing.
    expect(await subscriptions()).toEqual([
      { root_id: card.id, user_id: 'erin' },
    ])
  })

  test('is not put under a card that is no longer its place when its post is made', async () => {
    // A comment on a trade sits under the market's card until the trade has
    // a card of its own. Dave likes such a comment. His request has chosen
    // the market's card when the trade gets its own, and only then holds the
    // lock of the market card's thread. Chosen again with the lock, the card
    // is another one: the like is refused and can be sent again, and nothing
    // is left behind. Copied under the market's card, the comment would stay
    // there while its readers are shown it under the trade's.
    await tradeWithAComment('onTrade', 'onTrade2')
    whileARequestRuns(/pg_advisory_xact_lock/, makeTradeCard)
    await expect(like('mc-onTrade', 'dave')).rejects.toMatchObject({
      code: 409,
    })
    expect(await stored('mc-onTrade')).toBeUndefined()
    expect(await marked('onTrade')).toBe(false)
    expect(await count('user_reactions')).toBe(0)
    // Sent again, with the trade's card there, it goes under that card.
    const tradeCard = await makeTradeCard()
    use(pg)
    await like('mc-onTrade', 'dave')
    expect(await stored('mc-onTrade')).toMatchObject({
      parent_id: tradeCard.id,
      root_id: tradeCard.id,
    })

    // The other way round, with a follow: a moderator removes the trade's
    // card while the request waits for the lock of that card's thread.
    whileARequestRuns(/pg_advisory_xact_lock/, () => removeCard(tradeCard.id))
    await expect(followFrom('mc-onTrade2')).rejects.toMatchObject({
      code: 409,
    })
    expect(await stored('mc-onTrade2')).toBeUndefined()
    expect(await subscriptions()).toEqual([])
    // Sent again, with the trade's card gone, it goes under the market's.
    await removeCard(tradeCard.id)
    use(pg)
    await followFrom('mc-onTrade2')
    expect(await stored('mc-onTrade2')).toMatchObject({ parent_id: card.id })
    expect(await subscriptions()).toEqual([
      { root_id: card.id, user_id: 'erin' },
    ])

    // A comment written on the market at such a moment, as a second trade
    // gets its card. Nobody is there to send it again, so joining is tried
    // once more, from the top and in a transaction of its own: the comment
    // joins the thread it now sits in, and the people following that thread
    // hear of it. (Here the first try's rollback also undid the card made
    // during it, so the second try finds the market's card.)
    await rows(
      `insert into contract_bets (bet_id, contract_id, user_id) values ('bet2', 'market', 'carol')`
    )
    const makeSecondTradeCard = () =>
      ensureSocialSource(pg, { contractId: 'market', betId: 'bet2' })
    const written = (id: string) =>
      ({ id, contractId: 'market', betId: 'bet2' } as ContractComment)
    await insertComment('written', { user: 'bob', data: { betId: 'bet2' } })
    const joined = await linkCommentToOpenDiscussion(
      interleave(/pg_advisory_xact_lock/, makeSecondTradeCard, 'before'),
      written('written')
    )
    expect(joined).toMatchObject({
      parent: { id: card.id },
      row: { id: 'mc-written', parent_id: card.id },
    })
    // If its place moves the second time too, it joins no discussion for
    // now and stays on its market, where Yap lists it. That is no failure.
    await insertComment('writtenToo', { user: 'bob', data: { betId: 'bet2' } })
    const movingEveryTime = {
      ...client,
      one: async (sql: string, params?: unknown) => {
        if (/pg_advisory_xact_lock/.test(sql)) await makeSecondTradeCard()
        return client.one(sql, params)
      },
      tx: (fn: (tx: unknown) => Promise<unknown>) =>
        client.tx(() => fn(movingEveryTime)),
    }
    expect(
      await linkCommentToOpenDiscussion(
        movingEveryTime as unknown as SupabaseDirectClient,
        written('writtenToo')
      )
    ).toBeNull()
    expect(await stored('mc-writtenToo')).toBeUndefined()
    expect(await marked('writtenToo')).toBe(false)
  })

  test('a block made after the request began counts for what a reply quotes and for whom an edit mentions', async () => {
    // Erin replies to a comment on Carol's trade and quotes "q", a comment
    // Dave wrote on the market. Her request has read her blocks when Dave
    // blocks her, and then the trade gets its card. The comment she replies
    // to is given its post under that card, and nothing about that thread
    // concerns Dave. The quote is checked against her blocks as they are
    // with the thread locked, and is refused.
    await tradeWithAComment('onTrade')
    await insertComment('q', { user: 'dave' })
    whileARequestRuns(/for update of cc/, async () => {
      await block('dave', { blockedUserIds: ['erin'] })
      await block('erin', { blockedByUserIds: ['dave'] })
      await makeTradeCard()
    })
    await expect(
      createSocialPost(
        API['create-social-post'].props.parse({
          content: { text: 'see what Dave wrote', marketIds: ['market'] },
          parentId: 'mc-onTrade',
          source: { contractId: 'market', commentId: 'q' },
        }),
        signedIn('erin'),
        req
      )
    ).rejects.toMatchObject({
      code: 400,
      message: 'Source comment is unavailable',
    })
    expect(await stored('mc-onTrade')).toBeUndefined()
    expect(await count('social_posts', `user_id='erin'`)).toBe(0)

    // Bob edits his own comment on Yap, which gives it its post, and adds a
    // mention of Dave. Dave blocks Bob after Bob's request began. The
    // mention is checked against Bob's blocks as they are with the post
    // locked.
    whileARequestRuns(/for update of cc/, async () => {
      await block('dave', { blockedUserIds: ['bob'] })
      await block('bob', { blockedByUserIds: ['dave'] })
    })
    await expect(
      editSocialPost(
        API['edit-social-post'].props.parse({
          id: 'mc-x',
          content: {
            text: '',
            marketIds: [],
            richContent: {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: 'ask ' },
                    { type: 'mention', attrs: { id: 'dave', label: 'dave' } },
                  ],
                },
              ],
            },
          },
        }),
        signedIn('bob'),
        req
      )
    ).rejects.toMatchObject({
      code: 400,
      message: 'Mentioned user is unavailable',
    })
    expect(await stored('mc-x')).toBeUndefined()
  })

  test('a block made after the request began counts, when the comment is given its place under a card made since', async () => {
    // Erin asks to follow from a comment on Carol's trade, and Dave likes
    // it. Each request has read its sender's blocks when Carol blocks them
    // both, and then the trade gets its card, which is Carol's. The comment
    // is given its post under that card. The check made with the thread
    // locked reads the sender's blocks again, and refuses. Checked against
    // the list read first, they would act in a thread whose author had
    // blocked them before the thread existed.
    await tradeWithAComment('onTrade')
    const carolBlocksThemThenHerTradeGetsItsCard = async () => {
      await block('carol', { blockedUserIds: ['erin', 'dave'] })
      await block('erin', { blockedByUserIds: ['carol'] })
      await block('dave', { blockedByUserIds: ['carol'] })
      await makeTradeCard()
    }
    whileARequestRuns(
      /for update of cc/,
      carolBlocksThemThenHerTradeGetsItsCard
    )
    await expect(followFrom('mc-onTrade')).rejects.toMatchObject({
      code: 403,
    })
    whileARequestRuns(
      /for update of cc/,
      carolBlocksThemThenHerTradeGetsItsCard
    )
    await expect(like('mc-onTrade', 'dave')).rejects.toMatchObject({
      code: 403,
    })
    expect(await stored('mc-onTrade')).toBeUndefined()
    expect(await subscriptions()).toEqual([])
    expect(await count('user_reactions')).toBe(0)
  })

  test("gets no post once its author and its market's creator block one another, though it was found before", async () => {
    // "onTrade" is Bob's comment on Carol's trade. Dave likes it on Yap. His
    // request has found it there, under the market's card, when the market's
    // creator blocks Bob, and then the trade gets its card, which is Carol's.
    // Bob has no block with Carol, whose thread it now is. But Yap shows no
    // comment whose author has a block with its market's creator, whoever
    // wrote the thread. The check made with the thread locked asks that too,
    // with Bob's blocks as they are then, and the like is refused. Asked only
    // by the look made before the locks, the comment would get a post in a
    // thread it could be shown in at no one moment.
    await tradeWithAComment('onTrade')
    const creatorBlocksBob = async () => {
      await block('owner', { blockedUserIds: ['bob'] })
      await block('bob', { blockedByUserIds: ['owner'] })
    }
    const unavailable = {
      code: 403,
      message: 'This shared discussion is unavailable',
    }
    whileARequestRuns(/for update of cc/, async () => {
      await creatorBlocksBob()
      await makeTradeCard()
    })
    await expect(like('mc-onTrade', 'dave')).rejects.toMatchObject(unavailable)
    expect(await stored('mc-onTrade')).toBeUndefined()
    expect(await marked('onTrade')).toBe(false)
    expect(await count('user_reactions')).toBe(0)

    // The same for the comment a reply written on the market sits under.
    // Dave replies to "onTrade" on the market, and the reply's join finds it
    // on Yap without a post, under the trade's card. Then the creator blocks
    // Bob. Neither comment gets a post.
    const tradeCard = await makeTradeCard()
    await insertComment('reply', {
      user: 'dave',
      data: { replyToCommentId: 'onTrade' },
    })
    await expect(
      linkCommentToOpenDiscussion(
        interleave(/for update of cc/, creatorBlocksBob, 'before'),
        {
          id: 'reply',
          contractId: 'market',
          replyToCommentId: 'onTrade',
        } as ContractComment
      )
    ).rejects.toMatchObject(unavailable)
    expect(await count('social_posts', 'market_comment_id is not null')).toBe(0)

    // With the block there, Yap shows neither comment, by its list or by its
    // id, and a comment Bob writes on that trade joins no thread.
    await creatorBlocksBob()
    expect(await findSocialPost(pg, 'mc-onTrade')).toBeNull()
    expect(await findSocialPost(pg, 'mc-reply')).toBeNull()
    expect((await page(tradeCard.id)).posts).toEqual([])
    await insertComment('written', { user: 'bob', data: { betId: 'bet1' } })
    await expect(
      linkCommentToOpenDiscussion(pg, {
        id: 'written',
        contractId: 'market',
        betId: 'bet1',
      } as ContractComment)
    ).rejects.toMatchObject(unavailable)
    expect(await count('social_posts', 'market_comment_id is not null')).toBe(0)
  })

  test('taking back a like from a comment that is not on Yap is refused, and gives it no post if its market gets a card in that moment', async () => {
    // "elsewhere" is on a market that has no card, so it is not on Yap. Erin
    // liked it on its market, and Yap's request to take the like back is
    // sent with its id. The request finds neither a post nor a comment shown
    // on Yap. Then the market gets its card. The request stops where it
    // found nothing. Going on, it would find the comment on Yap now and give
    // it a post, which taking back a like never does.
    await insertComment('elsewhere', { contract: 'other', user: 'bob' })
    await rows(
      `insert into user_reactions (content_id, content_type, content_owner_id, user_id)
       values ('elsewhere', 'comment', 'bob', 'erin')`
    )
    whileARequestRuns(
      /canonical_key in \(\$2,\$3\)/,
      () => ensureSocialSource(pg, { contractId: 'other' }),
      'after'
    )
    await expect(like('mc-elsewhere', 'erin', true)).rejects.toMatchObject({
      code: 404,
    })
    expect(await count('social_posts', 'market_comment_id is not null')).toBe(0)
    expect(await marked('elsewhere')).toBe(false)
    expect(await count('user_reactions', `content_id='elsewhere'`)).toBe(1)
  })

  test('taking back a like does not look for a comment that was not there when its lock was asked for', async () => {
    // The request asks for the comment's lock and finds no such comment.
    // The comment is written a moment later. Only a post that is there can
    // have a like taken back now: looked for and found on Yap, the comment
    // would have the like allowance asked for before its own lock, the other
    // way round from a like.
    whileARequestRuns(
      /from contract_comments where comment_id=\$1 for update/,
      () => insertComment('justWritten', { user: 'bob' }),
      'after'
    )
    statements = []
    await expect(like('mc-justWritten', 'erin', true)).rejects.toMatchObject({
      code: 404,
    })
    const sent = statements
    statements = undefined
    expect(
      sent.some((sql) => /insert into social_write_limits/.test(sql))
    ).toBe(false)
    expect(await stored('mc-justWritten')).toBeUndefined()
  })

  test('a comment hidden for a moment as a read began still has the replies without posts on its page', async () => {
    // "x" has its post, an older reply without one ("xr") and a newer reply
    // with one ("xs"). A moderator hides "x" while the read is asking which
    // market its replies are written on, and takes the hide back before the
    // list is read. The list decides by what it sees itself: the thread is
    // open and the comment can be seen, so the older reply is first and the
    // newer one is on the next page. Decided by the earlier look, the page
    // would hold the newer reply only and say it was the last.
    await ensureMarketCommentPost(pg, 'x')
    await insertComment('xs', { user: 'dave', data: { replyToCommentId: 'x' } })
    await ensureMarketCommentPost(pg, 'xs')
    const setHidden = async (hidden: boolean) => {
      await rows(
        `update contract_comments set data=data || jsonb_build_object('hidden',$1::boolean,'hiddenOnYap',$1::boolean) where comment_id='x'`,
        [hidden]
      )
      await rows(
        `update social_posts set hidden_time=case when $1 then now() end where id='mc-x'`,
        [hidden]
      )
    }
    let asked = 0
    const hiddenForAMoment = {
      ...client,
      oneOrNone: async (sql: string, params?: unknown) => {
        const asksForMarket =
          /^select cc\.contract_id from contract_comments cc join social_posts s/.test(
            sql
          )
        if (asksForMarket) {
          asked++
          await setHidden(true)
        }
        const result = await client.oneOrNone(sql, params)
        if (asksForMarket) await setHidden(false)
        return result
      },
    } as unknown as SupabaseDirectClient
    const first = await readSocialPosts(
      hiddenForAMoment,
      anyone,
      API['get-social-posts'].props.parse({ parentId: 'mc-x', limit: 1 })
    )
    expect(asked).toBe(1)
    expect(ids(first.posts)).toEqual(['mc-xr'])
    expect(first.nextCursor).not.toBeNull()
    const second = await page('mc-x', anyone, first.nextCursor ?? undefined, 1)
    expect(ids(second.posts)).toEqual(['mc-xs'])
    expect(second.nextCursor).toBeNull()
  })

  test('a page of comments without posts asks for no count of posts', async () => {
    // Their reply counts come from the market in one statement. The count
    // for posts has nothing to count and is not sent.
    await insertComment('z', { user: 'bob' })
    statements = []
    const first = await page(card.id)
    const sent = statements
    statements = undefined
    expect(ids(first.posts)).toEqual(['mc-x', 'mc-z'])
    expect(first.posts.map((post) => post.replyCount)).toEqual([1, 0])
    const countsOfPosts = sent.filter((sql) =>
      /^\s*select requested\.id as parent_id, \(case/.test(sql)
    )
    expect(countsOfPosts).toEqual([])
    // With one of them on Yap, it is sent, for that one.
    await ensureMarketCommentPost(pg, 'x')
    statements = []
    const second = await page(card.id)
    const sentAgain = statements
    statements = undefined
    expect(second.posts.map((post) => post.replyCount)).toEqual([1, 0])
    expect(
      sentAgain.filter((sql) =>
        /^\s*select requested\.id as parent_id, \(case/.test(sql)
      )
    ).toHaveLength(1)
  })

  test('its likers and its page can be read while the comment above it gets its post', async () => {
    // "xr" has no post and sits under "x", which has none either. A read
    // looks the people up, then "x" gets its post, then the read looks the
    // posts up and finds "x" there, written by someone it did not look up.
    await rows(
      `insert into user_reactions (content_id, content_type, content_owner_id, user_id)
       values ('xr', 'comment', 'carol', 'dave')`
    )
    const whilePostIsMade = () =>
      interleave(
        /^select \* from social_posts where id = any\(\$1::text\[\]\)$/,
        () => ensureMarketCommentPost(pg, 'x'),
        'before'
      )
    // The likers read takes the comment above along, so it has the author.
    jest
      .mocked(createSupabaseDirectClient)
      .mockReturnValue(
        whilePostIsMade() as ReturnType<typeof createSupabaseDirectClient>
      )
    const likers = (await getSocialLikers(
      API['get-social-likers'].props.parse({ id: 'mc-xr' }),
      undefined,
      req
    )) as { users: { id: string }[] }
    expect(likers.users.map((user) => user.id)).toEqual(['dave'])
    expect(await stored('mc-x')).toBeDefined()

    // A read that did not take it along still answers, without the name.
    await insertComment('y', { user: 'bob' })
    await insertComment('yr', {
      user: 'carol',
      data: { replyToCommentId: 'y' },
    })
    const reply = (await findSocialPost(pg, 'mc-yr'))!
    const [post] = await hydrateSocialPosts(
      interleave(
        /^select \* from social_posts where id = any\(\$1::text\[\]\)$/,
        () => ensureMarketCommentPost(pg, 'y'),
        'before'
      ),
      [reply],
      anyone,
      false
    )
    expect(post).toMatchObject({ id: 'mc-yr', parentId: 'mc-y' })
    expect(post.parentAuthor).toBeNull()
  })
})

describe('older comments that reply to a reply', () => {
  test('however long the chain; and comments that reply to each other open nothing', async () => {
    const card = await ensureSocialSource(pg, { contractId: 'market' })
    const LENGTH = 40
    const name = (index: number) => 'n' + String(index).padStart(2, '0')
    for (let index = 0; index < LENGTH; index++)
      await insertComment(name(index), {
        data: index ? { replyToCommentId: name(index - 1) } : {},
      })
    const lowest = await readOnly(async () => ({
      page: await open('mc-' + name(LENGTH - 1)),
      listedUnderTheOneAbove: ids((await page('mc-' + name(LENGTH - 2))).posts),
    }))
    expect(ids(lowest.page.ancestors)).toEqual([
      card.id,
      ...Array.from({ length: LENGTH - 1 }, (_, index) => 'mc-' + name(index)),
    ])
    expect(lowest.listedUnderTheOneAbove).toEqual(['mc-' + name(LENGTH - 1)])
    // Acting on the lowest gives all forty their posts.
    await pg.tx((tx) => materializeSocialPost(tx, 'mc-' + name(LENGTH - 1)))
    expect(await count('social_posts', 'market_comment_id is not null')).toBe(
      LENGTH
    )

    // Two comments that each reply to the other have no way up to a card.
    await insertComment('loop1', { data: { replyToCommentId: 'loop2' } })
    await insertComment('loop2', { data: { replyToCommentId: 'loop1' } })
    expect(await findPendingCommentPost(pg, 'loop1')).toBeNull()
    await expect(open('mc-loop2')).rejects.toMatchObject({ code: 404 })
    expect(await count('social_posts')).toBe(LENGTH + 1)
  })

  test('are listed, opened and given posts at any depth', async () => {
    // Since May 2026 a comment replies to a top-level comment or to none.
    // Before that it could reply to a reply, and those comments are still on
    // their markets.
    const card = await ensureSocialSource(pg, { contractId: 'market' })
    const chain = ['a', 'b', 'c', 'd', 'e']
    for (const [index, id] of chain.entries())
      await insertComment(id, {
        user: ['alice', 'bob', 'carol', 'dave', 'erin'][index],
        data: index ? { replyToCommentId: chain[index - 1] } : {},
      })

    const read = await readOnly(async () => ({
      lists: [
        ids(await all(card.id)),
        ids(await all('mc-a')),
        ids(await all('mc-b')),
        ids(await all('mc-c')),
        ids(await all('mc-d')),
        ids(await all('mc-e')),
      ],
      d: await open('mc-d'),
      e: await open('mc-e'),
    }))
    expect(read.lists).toEqual([
      ['mc-a'],
      ['mc-b'],
      ['mc-c'],
      ['mc-d'],
      ['mc-e'],
      [],
    ])
    expect(ids(read.e.ancestors)).toEqual([
      card.id,
      'mc-a',
      'mc-b',
      'mc-c',
      'mc-d',
    ])
    expect(read.e.ancestors.map((post) => post.replyCount)).toEqual([
      1, 1, 1, 1, 1,
    ])
    expect(read.e.post).toMatchObject({
      parentId: 'mc-d',
      rootId: card.id,
      parentAuthor: { id: 'dave' },
    })
    expect(read.d.post).toMatchObject({
      replyCount: 1,
      parentAuthor: { id: 'carol' },
    })
    expect(await count('social_posts')).toBe(1)

    // A like on the lowest gives every comment above it its post, in place.
    await reactToSocialPost(
      API.react.props.parse({ contentId: 'mc-e', contentType: 'social_post' }),
      signedIn('alice'),
      req
    )
    expect(
      await rows(
        `select id, parent_id, root_id from social_posts where market_comment_id is not null order by created_time`
      )
    ).toEqual(
      chain.map((id, index) => ({
        id: 'mc-' + id,
        parent_id: index ? 'mc-' + chain[index - 1] : card.id,
        root_id: card.id,
      }))
    )
    expect(ids((await open('mc-e')).ancestors)).toEqual(ids(read.e.ancestors))
  })
})

describe("a post that is not its comment's own copy", () => {
  test('takes no replies from its market: none is listed, counted or given a post', async () => {
    // A reply on Yap under one market's card can quote another market. Its
    // post then names the other market as its source, while the comment
    // written with it is on the first. Replies written on the market to that
    // comment cannot join under such a post, so they are not shown as if
    // they could.
    await ensureSocialSource(pg, { contractId: 'market' })
    await insertComment('x', { user: 'bob' })
    await ensureMarketCommentPost(pg, 'x')
    await insertComment('xr', {
      user: 'carol',
      data: { replyToCommentId: 'x' },
    })
    const seen = async () => ({
      listed: ids((await page('mc-x')).posts),
      count: (await open('mc-x')).post.replyCount,
      counted: (await socialReplyCounts(pg, ['mc-x'], []))[0].count,
      found: !!(await findPendingCommentPost(pg, 'xr')),
    })
    const joined = { listed: ['mc-xr'], count: 1, counted: 1, found: true }
    const apart = { listed: [], count: 0, counted: 0, found: false }
    expect(await seen()).toEqual(joined)

    await rows(
      `update social_posts set source_contract_id='other' where id='mc-x'`
    )
    expect(await seen()).toEqual(apart)
    await expect(
      pg.tx((tx) => materializeSocialPost(tx, 'mc-xr'))
    ).rejects.toMatchObject({ code: 404 })
    // The copier's own answer, which the lists now agree with.
    await expect(
      pg.tx((tx) => ensureMarketCommentPost(tx, 'xr'))
    ).rejects.toMatchObject({ code: 409 })

    // The same for a post that someone other than the comment's author wrote.
    await rows(
      `update social_posts set source_contract_id='market', user_id='dave' where id='mc-x'`
    )
    expect(await seen()).toEqual(apart)
    await rows(`update social_posts set user_id='bob' where id='mc-x'`)
    expect(await seen()).toEqual(joined)

    // And for a comment deleted on its market by a tool that leaves its post
    // on Yap alone (the bulk spam tool, a super-ban). The post is still
    // there and its thread is open, but the copier puts no reply under a
    // comment that can no longer be seen.
    await rows(
      `update contract_comments set data=data || '{"deleted":true}' where comment_id='x'`
    )
    expect(await stored('mc-x')).toMatchObject({ deleted_time: null })
    expect(await seen()).toEqual(apart)
    await expect(
      pg.tx((tx) => materializeSocialPost(tx, 'mc-xr'))
    ).rejects.toMatchObject({ code: 404 })
    await expect(
      pg.tx((tx) => ensureMarketCommentPost(tx, 'xr'))
    ).rejects.toMatchObject({ code: 404 })
    await rows(
      `update contract_comments set data=data - 'deleted' where comment_id='x'`
    )
    expect(await seen()).toEqual(joined)
    expect(await count('social_posts', `market_comment_id='xr'`)).toBe(0)
  })

  test('a comment with an empty id for the comment it replies to has no place on Yap', async () => {
    // The market's API keeps an empty id as it was sent. Such a comment is
    // not top-level to the lists and replies to nothing, so its id opens
    // nothing and gives it no post.
    const card = await ensureSocialSource(pg, { contractId: 'market' })
    await insertComment('plain')
    await insertComment('empty', { data: { replyToCommentId: '' } })
    expect(ids(await all(card.id))).toEqual(['mc-plain'])
    expect((await open(card.id)).post.replyCount).toBe(1)
    expect(await findPendingCommentPost(pg, 'empty')).toBeNull()
    await expect(open('mc-empty')).rejects.toMatchObject({ code: 404 })
    await expect(
      pg.tx((tx) => materializeSocialPost(tx, 'mc-empty'))
    ).rejects.toMatchObject({ code: 404 })
    expect(await count('social_posts')).toBe(1)
  })
})

describe('how the lists are read', () => {
  test('a card by one pass over its market in time order, and a comment by the replies to it', async () => {
    // Enough rows for PostgreSQL's choices to show: a market with 2,000
    // top-level comments and three replies under each, half of the top-level
    // ones with posts, another market whose 3,000 comments all have posts,
    // and 400 people.
    const TOPS = 2000
    await db.exec(`
      insert into users (id) select 'u' || g from generate_series(1, 400) g;
      insert into private_users (id) select 'u' || g from generate_series(1, 400) g;
    `)
    await rows(
      `insert into contract_comments (contract_id, comment_id, user_id, created_time, data)
       select 'market', 'c' || g, 'u' || (g % 400 + 1), millis_to_ts($3 + g * 1000),
         jsonb_build_object('id', 'c' || g, 'userId', 'u' || (g % 400 + 1), 'contractId', 'market',
           'createdTime', $3 + g * 1000, 'content', $1::jsonb)
       from generate_series(1, $2) g`,
      [JSON.stringify(doc('hello')), TOPS, BASE]
    )
    await rows(
      `insert into contract_comments (contract_id, comment_id, user_id, created_time, data)
       select 'market', 'c' || g || 'r' || r, 'u' || ((g + r) % 400 + 1), millis_to_ts($3 + g * 1000 + r),
         jsonb_build_object('id', 'c' || g || 'r' || r, 'userId', 'u' || ((g + r) % 400 + 1), 'contractId', 'market',
           'createdTime', $3 + g * 1000 + r, 'replyToCommentId', 'c' || g, 'content', $1::jsonb)
       from generate_series(1, $2) g, generate_series(1, 3) r`,
      [JSON.stringify(doc('a reply')), TOPS, BASE]
    )
    await rows(
      `insert into contract_comments (contract_id, comment_id, user_id, created_time, data)
       select 'other', 'o' || g, 'alice', millis_to_ts($2 + g * 1000),
         jsonb_build_object('id', 'o' || g, 'userId', 'alice', 'contractId', 'other',
           'createdTime', $2 + g * 1000, 'content', $1::jsonb)
       from generate_series(1, 3000) g`,
      [JSON.stringify(doc('elsewhere')), BASE - 10_000_000]
    )
    const elsewhere = await ensureSocialSource(pg, { contractId: 'other' })
    const card = await ensureSocialSource(pg, { contractId: 'market' })
    await rows(
      `insert into social_posts (id, user_id, text, parent_id, root_id, market_comment_id, source_contract_id, canonical_key, feed_visible, created_time)
       select 'mc-' || comment_id, user_id, 'copy', $1, $1, comment_id, contract_id, 'comment:' || comment_id, false, created_time
       from contract_comments where contract_id='other'
         or (contract_id='market' and data->>'replyToCommentId' is null and right(comment_id, 1) in ('0','2','4','6','8'))`,
      [elsewhere.id]
    )
    await rows(
      `update social_posts set parent_id=$1, root_id=$1 where source_contract_id='market' and market_comment_id is not null`,
      [card.id]
    )
    const comment = (await stored('mc-c10'))!
    await db.exec('analyze')

    // Take the statement each list sends.
    const statements: string[] = []
    const recording = {
      ...client,
      manyOrNone: (sql: string, params?: unknown) => {
        statements.push(pgp.as.format(sql, params))
        return client.manyOrNone(sql, params)
      },
    } as unknown as SupabaseDirectClient
    const cursor = `${
      (
        await rows(
          `select created_time::text as t from contract_comments where comment_id='c1000'`
        )
      )[0].t
    }|mc-c1000`
    expect(
      await listCardComments(recording, card, anyone, undefined, 31)
    ).toHaveLength(31)
    expect(
      await listCardComments(recording, card, anyone, cursor, 31)
    ).toHaveLength(31)
    expect(
      await listCommentReplies(recording, comment, anyone, undefined, 31)
    ).toHaveLength(3)
    expect(statements).toHaveLength(3)

    // Run each and look at what PostgreSQL expected, read and threw away.
    type PlanNode = Record<string, unknown> & { Plans?: PlanNode[] }
    const run = async (statement: string) => {
      const raw = (
        await rows(`explain (analyze, format json) ${statement}`)
      )[0]['QUERY PLAN']
      const tree = (typeof raw === 'string' ? JSON.parse(raw) : raw) as {
        Plan: PlanNode
      }[]
      const nodes = (node: PlanNode): PlanNode[] => [
        node,
        ...(node.Plans ?? []).flatMap(nodes),
      ]
      const every = nodes(tree[0].Plan)
      const times = (node: PlanNode, key: string) =>
        Number(node[key] ?? 0) * Number(node['Actual Loops'] ?? 1)
      const comments = every.filter(
        (node) =>
          node['Relation Name'] === 'contract_comments' &&
          node['Alias'] === 'cc'
      )
      return {
        // The index it read the comments by.
        index: comments.map((node) => String(node['Index Name'])),
        // Comments it read, kept or not, over every time it read them.
        comments: comments.reduce(
          (sum, node) =>
            sum +
            times(node, 'Actual Rows') +
            times(node, 'Rows Removed by Filter'),
          0
        ),
        // How many comments it planned the rest of the statement for.
        expected: Math.max(
          ...comments.map((node) => Number(node['Plan Rows']))
        ),
        // Rows of the posts, people and users tables it went through.
        visited: every
          .filter((node) =>
            ['social_posts', 'private_users', 'users'].includes(
              String(node['Relation Name'])
            )
          )
          .reduce(
            (sum, node) =>
              sum +
              times(node, 'Actual Rows') +
              times(node, 'Rows Removed by Filter'),
            0
          ),
        // Rows of another table held against a comment they do not belong to.
        mismatched: every.reduce(
          (sum, node) => sum + times(node, 'Rows Removed by Join Filter'),
          0
        ),
        sorted: every
          .filter((node) => node['Node Type'] === 'Sort')
          .map((node) => Number(node['Actual Rows'])),
      }
    }

    // A card's first page and a page from its middle: the comments are read
    // in time order and the reading stops at a page. A page is 31 top-level
    // comments, each with three replies in between. Reading the market, the
    // posts of the other market, or every post or person for each comment,
    // is thousands or hundreds of thousands.
    for (const statement of statements.slice(0, 2)) {
      const plan = await run(statement)
      // By the index on (comment replied to, market, time), which holds this
      // market's top-level comments in time order. The index on time alone
      // gives the same order over every market's comments, and the list's
      // order is written so that PostgreSQL cannot take it.
      expect(plan.index).toEqual(['contract_replies'])
      expect(plan.comments).toBeLessThan(400)
      expect(plan.visited).toBeLessThan(400)
      expect(plan.mismatched).toBeLessThan(400)
      // Nothing of the market's size is sorted to find a page.
      expect(plan.sorted.every((sortedRows) => sortedRows < 400)).toBe(true)
      // PostgreSQL chooses how to look up each comment's post and author by
      // the number of comments it expects. A guess of one, which a condition
      // such as "is not distinct from" a null gives, is what once made a read
      // go through the whole posts table for each comment. Its guess need not
      // be close, only of the right order.
      expect(plan.expected * 50).toBeGreaterThanOrEqual(TOPS)
    }
    // A comment's replies are found by the comment they reply to.
    const forComment = await run(statements[2])
    expect(forComment.comments).toBeLessThan(50)
    expect(forComment.visited).toBeLessThan(50)
  })
})

describe('a comment its author marked as written by AI', () => {
  const read = async (row: SocialRow) =>
    (await hydrateSocialPosts(pg, [row], anyone, true, true))[0]
  // A top-level Yap post by Erin that quotes a comment from its market.
  const quoteOf = async (commentId: string, contractId = 'market') => {
    const id = `quotes-${contractId}-${commentId}`
    await rows(
      `insert into social_posts (id, user_id, text, root_id, source_contract_id, source_comment_id)
       values ($1, 'erin', 'look', $1, $2, $3)`,
      [id, contractId, commentId]
    )
    return (await stored(id))!
  }

  test('keeps its label on Yap: with no post yet, as its post, and wherever it is quoted', async () => {
    await ensureSocialSource(pg, { contractId: 'market' })
    await insertComment('by-ai', { user: 'bob', data: { isAiComment: true } })
    await insertComment('by-person', { user: 'bob' })

    const ai = await read((await findPendingCommentPost(pg, 'by-ai'))!)
    const person = await read((await findPendingCommentPost(pg, 'by-person'))!)
    expect(ai.isAiComment).toBe(true)
    expect(person).not.toHaveProperty('isAiComment')

    // Its post, once made, reads the same.
    await pg.tx((tx) => materializeSocialPost(tx, 'mc-by-ai'))
    const copy = await read((await stored('mc-by-ai'))!)
    expect(copy.isAiComment).toBe(true)

    // Quoting its post, or the comment itself from its market, says so too.
    expect(quoteSocialPost(copy).isAiComment).toBe(true)
    expect(quoteSocialPost(person)).not.toHaveProperty('isAiComment')
    const quotesAi = await read(await quoteOf('by-ai'))
    const quotesPerson = await read(await quoteOf('by-person'))
    expect(quotesAi.source).toMatchObject({
      kind: 'comment',
      isAiComment: true,
    })
    expect(quotesPerson.source).toMatchObject({ kind: 'comment' })
    expect(quotesPerson.source).not.toHaveProperty('isAiComment')
    // The quoting post is Erin's own words, so it carries no label itself.
    expect(quotesAi).not.toHaveProperty('isAiComment')

    const wrongMarket = await read(await quoteOf('by-ai', 'other'))
    expect(wrongMarket.source).toMatchObject({
      kind: 'comment',
      text: 'comment by-ai',
    })
    expect(wrongMarket.source).not.toHaveProperty('isAiComment')
  })

  test.each([
    [false, true],
    [true, false],
    [true, true],
  ])(
    'copies of the same comment id use their own AI flags (market=%s, other=%s)',
    async (marketAi, otherAi) => {
      const copyOn = async (contract: string, isAiComment: boolean) => {
        const card = await ensureSocialSource(pg, { contractId: contract })
        await insertComment('shared-id', { contract, data: { isAiComment } })
        const [entry] = await listCardComments(pg, card, anyone, undefined, 1)
        return entry.pending!
      }
      const copies = [
        await copyOn('market', marketAi),
        await copyOn('other', otherAi),
      ]
      // Both copies see the same linked rows, in whichever order SQL returns.
      const posts = await hydrateSocialPosts(pg, copies, anyone)
      expect(posts.map((post) => post.isAiComment)).toEqual([
        marketAi || undefined,
        otherAi || undefined,
      ])
    }
  )

  test('a copy takes no label from its comment once that comment cannot be seen', async () => {
    const card = await ensureSocialSource(pg, { contractId: 'market' })
    await ensureSocialSource(pg, { contractId: 'other' })
    // The other market's comment goes in first, so a lookup of the first row
    // with this id finds it and the copy is not taken for removed below.
    await insertComment('shared-id', { contract: 'other' })
    await insertComment('shared-id', { data: { isAiComment: true } })
    const [entry] = await listCardComments(pg, card, anyone, undefined, 1)
    const copy = entry.pending!
    expect(copy.source_contract_id).toBe('market')
    expect((await read(copy)).isAiComment).toBe(true)
    // Its market goes private. Another market's comment with the same id is
    // still public, so which row decides whether the copy shows predates
    // this label; the label itself is never read from the hidden comment.
    await rows(`update contracts set visibility='private' where id='market'`)
    const after = await read(copy)
    expect(after.removed).toBeNull()
    expect(after).not.toHaveProperty('isAiComment')
  })

  test.each([
    { mismatch: 'author', user: 'dave', market: 'market' },
    { mismatch: 'market', user: 'bob', market: 'other' },
  ])(
    'a linked post with a different $mismatch has no label',
    async ({ user, market }) => {
      await ensureSocialSource(pg, { contractId: 'market' })
      await insertComment('by-ai', { user: 'bob', data: { isAiComment: true } })
      await pg.tx((tx) => materializeSocialPost(tx, 'mc-by-ai'))
      await rows(
        `update social_posts set user_id=$1, source_contract_id=$2 where id='mc-by-ai'`,
        [user, market]
      )
      const post = await read((await stored('mc-by-ai'))!)
      expect(post.removed).toBeNull()
      expect(post).not.toHaveProperty('isAiComment')
    }
  )

  test('a quote keeps the label until the copy is taken off Yap', async () => {
    await ensureSocialSource(pg, { contractId: 'market' })
    await insertComment('by-ai', { user: 'bob', data: { isAiComment: true } })
    jest
      .mocked(getActiveSupporterEntitlements)
      .mockResolvedValueOnce([
        { entitlementId: SUPPORTER_TIERS.basic.id, enabled: true },
      ] as UserEntitlement[])
    const response = await createSocialPost(
      API['create-social-post'].props.parse({
        content: { text: 'look at this', marketIds: [] },
        source: { postId: 'mc-by-ai' },
      }),
      signedIn('erin'),
      req
    )
    const quote = 'result' in response ? response.result : response
    expect((await open(quote.id)).post.source).toMatchObject({
      kind: 'post',
      isAiComment: true,
    })

    await rows(`update social_posts set deleted_time=now() where id='mc-by-ai'`)
    const copy = await read((await stored('mc-by-ai'))!)
    expect(copy.removed).toBe('author')
    expect(copy).not.toHaveProperty('isAiComment')
    expect(quoteSocialPost(copy)).not.toHaveProperty('isAiComment')
    const { post } = await open(quote.id)
    expect(post.source).toMatchObject({ kind: 'post', unavailable: true })
    expect(post.source).not.toHaveProperty('isAiComment')
  })
})
