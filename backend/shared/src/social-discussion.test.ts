// Market comments and their copies on Yap, against an in-memory PostgreSQL.
//
// The Yap tables are built by running the repository's own migration files in
// order, so the constraints are the real ones (the 2,000-character check on a
// post's text, one reaction per person per post, the unique link from a post
// to a comment). The functions under test run their own SQL through the parts
// of pg-promise they use. No live database or network is used.
import { readFileSync } from 'fs'
import { join } from 'path'
import { PGlite } from '@electric-sql/pglite'
import * as pgPromise from 'pg-promise'

jest.mock('./websockets/server', () => ({ broadcast: jest.fn() }))
jest.mock('./utils', () => ({
  getUser: jest.fn(),
  getPrivateUser: jest.fn(),
  log: Object.assign(jest.fn(), { warn: jest.fn(), error: jest.fn() }),
  // Nothing here carries an unsafe link or frame for it to strip.
  sanitizeJsonContent: (content: unknown) => content,
}))
jest.mock('./supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(() => ({})),
}))
jest.mock('./supabase/entitlements', () => ({
  getActiveSupporterEntitlements: jest.fn(),
}))
jest.mock('./supabase/notifications', () => ({
  insertNotificationToSupabase: jest.fn(),
}))

import { JSONContent } from '@tiptap/core'
import { FIREBASE_CONFIG } from 'common/envs/constants'
import { socialPostToCommentContent } from 'common/social-rich-content'
import { PrivateUser } from 'common/user'
import {
  SOCIAL_RECONCILE_BATCH,
  commentToYapContent,
  ensureMarketCommentPost,
  ensureSocialSource,
  findSocialSource,
  isCommentYapRepresentable,
  linkCommentToOpenDiscussion,
  reconcileMarketDiscussion,
  syncSocialPostFromComment,
} from './social-discussion'
import { SocialRow, socialReplyCounts } from './social-posts'
import { SupabaseDirectClient } from './supabase/init'
import { getPrivateUser, log } from './utils'

const pgp = pgPromise()
const MIGRATIONS = join(__dirname, '../../supabase/migrations')
const migration = (name: string) =>
  readFileSync(join(MIGRATIONS, name), 'utf8').replace(/\r\n/g, '\n')
const MARKET_COMMENT = '2026103002_social_post_market_comment.sql'
const DISCUSSIONS = '2026111201_social_discussions.sql'

let db: PGlite
let depth = 0
const rows = async (sql: string, params?: unknown) =>
  (await db.query(pgp.as.format(sql, params))).rows as any[]
// The parts of pg-promise the helpers use. A transaction inside a transaction
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

const doc = (...paragraphs: string[]): JSONContent => ({
  type: 'doc',
  content: paragraphs.map((text) => ({
    type: 'paragraph',
    content: [{ type: 'text', text }],
  })),
})
const insertComment = async (
  id: string,
  options: {
    contract?: string
    user?: string
    time?: number
    content?: JSONContent
    data?: Record<string, unknown>
  } = {}
) => {
  const {
    contract = 'market',
    user = 'alice',
    time = 1_700_000_000_000 + (await count('contract_comments')) * 1000,
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
const count = async (table: string, where = 'true') =>
  (await rows(`select count(*)::int as n from ${table} where ${where}`))[0]
    .n as number
const post = async (id: string) =>
  (await rows('select * from social_posts where id=$1', [id]))[0] as
    | (SocialRow & { feed_visible: boolean })
    | undefined
const react = (
  contentId: string,
  type: 'social_post' | 'comment',
  user: string,
  reaction = 'like',
  time = '2026-11-01T00:00:00Z'
) =>
  rows(
    `insert into user_reactions (content_id, content_type, content_owner_id, user_id, reaction_type, created_time)
     values ($1, $2, 'alice', $3, $4, $5)`,
    [contentId, type, user, reaction, time]
  )
const reactions = async () =>
  (
    await rows(
      `select content_type || '/' || content_id || '/' || user_id || '/' || reaction_type as r
       from user_reactions order by 1`
    )
  ).map((row) => row.r as string)
const counters = async (commentId: string) =>
  (
    await rows(
      'select likes, dislikes from contract_comments where comment_id=$1',
      [commentId]
    )
  )[0] as { likes: number; dislikes: number }

beforeEach(async () => {
  jest.clearAllMocks()
  depth = 0
  db = new PGlite()
  // The tables the Yap migrations build on, cut down to the columns and
  // constraints that matter here.
  await db.exec(`
    create function millis_to_ts(millis bigint) returns timestamptz language sql immutable as
      $$ select to_timestamp(millis / 1000.0) $$;
    create table users (id text primary key);
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
    create table contract_bets (
      bet_id text primary key,
      contract_id text not null,
      user_id text not null,
      created_time timestamptz not null default now()
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
    insert into users (id) values ('owner'), ('alice'), ('bob'), ('carol'), ('dave');
    insert into contracts (id, creator_id) values ('market', 'owner'), ('other', 'owner');
    create table private_users (id text primary key, data jsonb not null default '{}');
    insert into private_users (id) select id from users;
  `)
  for (const name of [
    '2026091501_social_posts.sql',
    '2026091601_social_post_images.sql',
    '2026091602_social_post_quotes.sql',
    '2026092101_social_post_rich_content.sql',
  ])
    await db.exec(migration(name))
})
afterEach(() => db.close())

const migrate = async () => {
  await db.exec(migration(MARKET_COMMENT))
  await db.exec(migration(DISCUSSIONS))
}

describe('the Yap copy of a market comment', () => {
  const image = (name: string) =>
    `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_CONFIG.storageBucket}/o/user-images%2Falice%2F${name}.png?alt=media`
  const bold = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'loud', marks: [{ type: 'bold' }] }],
      },
    ],
  }

  test('is cut to the length Yap allows, by characters', () => {
    const long = commentToYapContent(doc('é'.repeat(2500)))
    expect([...long.text]).toHaveLength(2000)
    expect(long.text.endsWith('…')).toBe(true)
    expect(commentToYapContent(doc('short')).text).toBe('short')
  })

  test.each([
    ['plain paragraphs', doc('one', 'two'), true],
    [
      'a blank line between paragraphs',
      { type: 'doc', content: [doc('one').content![0], { type: 'paragraph' }] },
      true,
    ],
    [
      'what a Yap post itself wrote: a linked address and attached images',
      socialPostToCommentContent({
        text: 'see https://example.com/a for more',
        imageUrls: [image('one'), image('two')],
      }),
      true,
    ],
    [
      "an address the market's editor linked, with its own link attributes",
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'https://example.com/a',
                marks: [
                  {
                    type: 'link',
                    attrs: {
                      href: 'https://example.com/a',
                      target: '_blank',
                      class: null,
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      true,
    ],
    [
      'Yap image without text',
      socialPostToCommentContent({ text: '', imageUrls: [image('one')] }),
      true,
    ],
    [
      'link with custom attributes',
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'https://a.test',
                marks: [
                  {
                    type: 'link',
                    attrs: { href: 'https://a.test', target: '_self' },
                  },
                ],
              },
            ],
          },
        ],
      },
      false,
    ],
    ['bold text', bold, false],
    [
      'a link on other words',
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'source',
                marks: [{ type: 'link', attrs: { href: 'https://x.io' } }],
              },
            ],
          },
        ],
      },
      false,
    ],
    [
      'a list',
      {
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [{ type: 'listItem', content: doc('point').content }],
          },
        ],
      },
      false,
    ],
    ['more text than Yap holds', doc('y'.repeat(2500)), false],
  ])('Yap can hold %s without loss: %s', (_case, content, expected) => {
    expect(isCommentYapRepresentable(content as JSONContent)).toBe(expected)
  })

  test('an edit made on the market updates the copy', async () => {
    await migrate()
    await insertComment('c1')
    const row = await ensureMarketCommentPost(pg, 'c1')
    await syncSocialPostFromComment(pg, row.id, bold)
    expect(await post(row.id)).toMatchObject({ text: 'loud' })
    await syncSocialPostFromComment(pg, row.id, doc('z'.repeat(3000)))
    const copy = (await post(row.id))!
    expect([...copy.text]).toHaveLength(2000)
    expect(copy.edited_time).toBeTruthy()
  })
})

describe('adding a market to Yap and reading its discussion', () => {
  beforeEach(migrate)
  // One test below gives people blocks; the others have none.
  afterEach(() => jest.mocked(getPrivateUser).mockReset())

  test('comments that cannot be placed are left out, and the rest still join', async () => {
    await insertComment('plain')
    await insertComment('long', { content: doc('y'.repeat(2500)) })
    await insertComment('hidden', { data: { hidden: true } })
    await insertComment('under-hidden', {
      data: { replyToCommentId: 'hidden' },
    })
    await insertComment('deleted', { data: { deleted: true } })
    await insertComment('under-deleted', {
      data: { replyToCommentId: 'deleted' },
    })
    await insertComment('mod', { data: { isModComment: true } })
    await insertComment('under-mod', { data: { replyToCommentId: 'mod' } })
    await insertComment('reply', { data: { replyToCommentId: 'plain' } })
    const card = await ensureSocialSource(pg, { contractId: 'market' })

    await pg.tx((tx) => reconcileMarketDiscussion(tx, card))

    expect(
      (
        await rows(
          'select market_comment_id from social_posts where market_comment_id is not null order by 1'
        )
      ).map((r) => r.market_comment_id)
    ).toEqual(['long', 'plain'])
    const plain = (await post('mc-plain'))!
    await pg.tx((tx) => reconcileMarketDiscussion(tx, plain))
    // The market keeps the long comment whole; Yap shows what it can hold.
    const long = (await post('mc-long'))!
    expect([...long.text]).toHaveLength(2000)
    expect((await post('mc-plain'))!.parent_id).toBe(card.id)
    expect((await post('mc-reply'))!.parent_id).toBe('mc-plain')
    expect(log.warn).not.toHaveBeenCalled()
  })

  test('a reply under a post that was removed from Yap, or hidden there, stays on the market only', async () => {
    const card = await ensureSocialSource(pg, { contractId: 'market' })
    for (const id of ['removed', 'hidden-on-yap', 'open']) {
      await insertComment(id)
      await ensureMarketCommentPost(pg, id)
      await insertComment(`under-${id}`, { data: { replyToCommentId: id } })
    }
    // The author took their comment off Yap; a moderator hid another there.
    await rows(
      `update social_posts set deleted_time=now() where id='mc-removed'`
    )
    await rows(
      `update social_posts set hidden_time=now() where id='mc-hidden-on-yap'`
    )
    await pg.tx((tx) => reconcileMarketDiscussion(tx, card))
    for (const id of ['open', 'removed', 'hidden-on-yap']) {
      const parent = (await post('mc-' + id))!
      await pg.tx((tx) => reconcileMarketDiscussion(tx, parent))
    }
    expect(await post('mc-under-open')).toBeTruthy()
    expect(await post('mc-under-removed')).toBeUndefined()
    expect(await post('mc-under-hidden-on-yap')).toBeUndefined()
    // The removed post keeps its link, so its comment is not copied again.
    expect(await count('social_posts', `market_comment_id='removed'`)).toBe(1)
  })

  test('sharing a reply whose parent cannot be on Yap is refused, without breaking anything else', async () => {
    await insertComment('hidden', { data: { hidden: true } })
    await insertComment('under-hidden', {
      data: { replyToCommentId: 'hidden' },
    })
    await insertComment('mod', { data: { isModComment: true } })
    await insertComment('under-mod', { data: { replyToCommentId: 'mod' } })
    await expect(
      ensureMarketCommentPost(pg, 'under-hidden')
    ).rejects.toMatchObject({ code: 404 })
    await expect(
      ensureMarketCommentPost(pg, 'under-mod')
    ).rejects.toMatchObject({ code: 400 })
    await expect(ensureMarketCommentPost(pg, 'mod')).rejects.toMatchObject({
      code: 400,
    })
    expect(await count('social_posts')).toBe(0)
  })

  test('one comment that fails in the database does not stop the others', async () => {
    await insertComment('first')
    // No such user: the copy cannot be written for this one.
    await insertComment('broken', { user: 'nobody' })
    await insertComment('last')
    const card = await ensureSocialSource(pg, { contractId: 'market' })
    await expect(
      pg.tx((tx) => reconcileMarketDiscussion(tx, card))
    ).resolves.toBeNull()
    expect(await post('mc-first')).toBeTruthy()
    expect(await post('mc-last')).toBeTruthy()
    expect(await post('mc-broken')).toBeUndefined()
    expect(log.warn).toHaveBeenCalledTimes(1)
  })

  test('one read adds a bounded number of comments, and later reads carry on', async () => {
    const total = SOCIAL_RECONCILE_BATCH + 30
    await rows(
      `insert into contract_comments (contract_id, comment_id, user_id, created_time, data)
       select 'market', 'c' || g, 'alice', millis_to_ts(1700000000000 + g),
         jsonb_build_object('id', 'c' || g, 'userId', 'alice', 'contractId', 'market',
           'createdTime', 1700000000000 + g, 'content', $1::jsonb)
       from generate_series(1, $2) g`,
      [JSON.stringify(doc('hello')), total]
    )
    const card = await ensureSocialSource(pg, { contractId: 'market' })
    const linked = () => count('social_posts', 'market_comment_id is not null')
    const boundary = await pg.tx((tx) => reconcileMarketDiscussion(tx, card))
    expect(boundary?.id).toBe('mc-c' + SOCIAL_RECONCILE_BATCH)
    expect(await linked()).toBe(SOCIAL_RECONCILE_BATCH)
    // Oldest first, so the first page of the thread is complete.
    expect(await post('mc-c1')).toBeTruthy()
    expect(
      await pg.tx((tx) =>
        reconcileMarketDiscussion(tx, card, `${boundary!.time}|${boundary!.id}`)
      )
    ).toBeNull()
    expect(await linked()).toBe(total)
    await pg.tx((tx) => reconcileMarketDiscussion(tx, card))
    expect(await linked()).toBe(total)
  })

  test('comments that can never join do not use up a read', async () => {
    // The market's creator has blocked bob, so his comments cannot join its
    // discussion. There are more of them than one read handles, and all are
    // older than alice's comment.
    await rows(
      `update private_users set data='{"blockedByUserIds":["owner"]}' where id='bob'`
    )
    jest.mocked(getPrivateUser).mockImplementation(async (id: string) => {
      const [row] = await rows('select data from private_users where id=$1', [
        id,
      ])
      return {
        id,
        blockedUserIds: [],
        blockedByUserIds: [],
        ...row?.data,
      } as PrivateUser
    })
    await rows(
      `insert into contract_comments (contract_id, comment_id, user_id, created_time, data)
       select 'market', 'b' || g, 'bob', millis_to_ts(1700000000000 + g),
         jsonb_build_object('id', 'b' || g, 'userId', 'bob', 'contractId', 'market',
           'createdTime', 1700000000000 + g, 'content', $1::jsonb)
       from generate_series(1, $2) g`,
      [JSON.stringify(doc('hello')), SOCIAL_RECONCILE_BATCH + 1]
    )
    await insertComment('later', { time: 1_700_000_500_000 })
    const card = await ensureSocialSource(pg, { contractId: 'market' })

    // The first read reaches alice's comment and leaves nothing to carry on.
    await expect(
      pg.tx((tx) => reconcileMarketDiscussion(tx, card))
    ).resolves.toBeNull()
    expect(await post('mc-later')).toBeTruthy()
    expect(await count('social_posts', `user_id='bob'`)).toBe(0)
    // Nothing was tried and refused.
    expect(log.warn).not.toHaveBeenCalled()

    // The same for a market that stops being public.
    const other = await ensureSocialSource(pg, { contractId: 'other' })
    await insertComment('unlisted', { contract: 'other' })
    await rows(`update contracts set visibility='unlisted' where id='other'`)
    await pg.tx((tx) => reconcileMarketDiscussion(tx, other))
    expect(await post('mc-unlisted')).toBeUndefined()
    expect(log.warn).not.toHaveBeenCalled()
  })

  test('a copy made by a read or by someone else does not make the author follow the thread', async () => {
    await insertComment('old', { user: 'bob' })
    await insertComment('reply', {
      user: 'carol',
      data: { replyToCommentId: 'old' },
    })
    const card = await ensureSocialSource(pg, { contractId: 'market' })
    // A visitor opens the market's discussion, then one comment's thread.
    await pg.tx((tx) => reconcileMarketDiscussion(tx, card))
    const old = (await post('mc-old'))!
    await pg.tx((tx) => reconcileMarketDiscussion(tx, old))
    // Someone shares another person's comment.
    await insertComment('shared', { user: 'dave' })
    await ensureSocialSource(pg, { contractId: 'market', commentId: 'shared' })

    expect(await post('mc-reply')).toBeTruthy()
    expect(await post('mc-shared')).toBeTruthy()
    // None of bob, carol or dave chose to get this thread's alerts.
    expect(await count('social_thread_subscriptions')).toBe(0)
  })
})

describe('a comment written on the market', () => {
  beforeEach(migrate)
  const written = async (
    id: string,
    data: Record<string, unknown> = {},
    contract = 'market'
  ) => {
    await insertComment(id, { contract, data })
    return {
      id,
      userId: 'alice',
      contractId: contract,
      ...data,
    } as never
  }

  test('joins the market, the comment or the trade it replies to, when that is on Yap', async () => {
    expect(
      await linkCommentToOpenDiscussion(pg, await written('early'))
    ).toBeNull()
    expect(await count('social_posts')).toBe(0)

    const card = await ensureSocialSource(pg, { contractId: 'market' })
    const top = await linkCommentToOpenDiscussion(pg, await written('top'))
    expect(top!.parent.id).toBe(card.id)
    expect(top!.row).toMatchObject({
      id: 'mc-top',
      parent_id: card.id,
      root_id: card.id,
      user_id: 'alice',
      feed_visible: false,
    })
    // The comment now points at its copy.
    expect(
      (
        await rows(
          `select data->>'socialPostId' as id from contract_comments where comment_id='top'`
        )
      )[0].id
    ).toBe('mc-top')

    const reply = await linkCommentToOpenDiscussion(
      pg,
      await written('reply', { replyToCommentId: 'top' })
    )
    expect(reply!.parent.id).toBe('mc-top')
    expect(reply!.row.parent_id).toBe('mc-top')

    await rows(
      `insert into contract_bets (bet_id, contract_id, user_id) values ('bet1', 'market', 'bob')`
    )
    const trade = await ensureSocialSource(pg, {
      contractId: 'market',
      betId: 'bet1',
    })
    const onTrade = await linkCommentToOpenDiscussion(
      pg,
      await written('on-trade', { betId: 'bet1' }),
      'bet1'
    )
    expect(onTrade!.row.parent_id).toBe(trade.id)
    // Commenting on the market is not a choice to follow the thread on Yap.
    expect(await count('social_thread_subscriptions')).toBe(0)
  })

  test('a historical comment cannot use a parent from another market', async () => {
    await insertComment('foreign-parent', { contract: 'other' })
    await insertComment('local-child', {
      data: { replyToCommentId: 'foreign-parent' },
    })
    await expect(
      pg.tx((tx) => ensureMarketCommentPost(tx, 'local-child'))
    ).rejects.toMatchObject({ code: 404 })
    expect(await count('social_posts')).toBe(0)
  })

  test('never joins a discussion on another market through a trade id', async () => {
    await rows(
      `insert into contract_bets (bet_id, contract_id, user_id) values ('bet1', 'market', 'bob')`
    )
    await ensureSocialSource(pg, { contractId: 'market', betId: 'bet1' })
    // A comment on a different market that names the same trade.
    expect(
      await linkCommentToOpenDiscussion(
        pg,
        await written('elsewhere', { betId: 'bet1' }, 'other'),
        'bet1'
      )
    ).toBeNull()
    expect(await post('mc-elsewhere')).toBeUndefined()
  })

  test('a comment on a trade whose card a moderator removed joins the market instead', async () => {
    const card = await ensureSocialSource(pg, { contractId: 'market' })
    await rows(
      `insert into contract_bets (bet_id, contract_id, user_id) values ('bet1', 'market', 'bob')`
    )
    const trade = await ensureSocialSource(pg, {
      contractId: 'market',
      betId: 'bet1',
    })
    // As deleteSocialPost leaves a removed card: it no longer names its market.
    await rows(
      `update social_posts set deleted_time=now(), source_contract_id=null, source_bet_id=null where id=$1`,
      [trade.id]
    )
    // A comment written after the removal.
    const fresh = await linkCommentToOpenDiscussion(
      pg,
      await written('fresh', { betId: 'bet1' }),
      'bet1'
    )
    expect(fresh!.row.parent_id).toBe(card.id)
    // One written earlier, picked up when the market's discussion is read.
    await insertComment('older', { data: { betId: 'bet1' } })
    await pg.tx((tx) => reconcileMarketDiscussion(tx, card))
    expect((await post('mc-older'))!.parent_id).toBe(card.id)
    expect(log.warn).not.toHaveBeenCalled()
  })

  test('stays a plain market comment when the discussion is closed, or the comment is a mod comment', async () => {
    const card = await ensureSocialSource(pg, { contractId: 'market' })
    expect(
      await linkCommentToOpenDiscussion(
        pg,
        await written('official', { isModComment: true })
      )
    ).toBeNull()

    // A moderator hid the comment's thread on Yap.
    await ensureMarketCommentPost(pg, await insertComment('root'))
    await rows(`update social_posts set hidden_time=now() where id='mc-root'`)
    expect(
      await linkCommentToOpenDiscussion(
        pg,
        await written('under-hidden', { replyToCommentId: 'root' })
      )
    ).toBeNull()

    // A moderator removed the market's row, as deleteSocialPost leaves it.
    await rows(
      `update social_posts set deleted_time=now(), source_contract_id=null where id=$1`,
      [card.id]
    )
    expect(
      await linkCommentToOpenDiscussion(pg, await written('after-removal'))
    ).toBeNull()
    expect(
      await count(
        'social_posts',
        `id in ('mc-under-hidden', 'mc-after-removal', 'mc-official')`
      )
    ).toBe(0)
  })

  test('undoing a share looks the item up and never creates it', async () => {
    await insertComment('c1')
    expect(await findSocialSource(pg, { contractId: 'market' })).toBeNull()
    expect(
      await findSocialSource(pg, { contractId: 'market', commentId: 'c1' })
    ).toBeNull()
    expect(await count('social_posts')).toBe(0)
    const card = await ensureSocialSource(pg, { contractId: 'market' })
    const copy = await ensureMarketCommentPost(pg, 'c1')
    expect((await findSocialSource(pg, { contractId: 'market' }))!.id).toBe(
      card.id
    )
    expect(
      (await findSocialSource(pg, { contractId: 'market', commentId: 'c1' }))!
        .id
    ).toBe(copy.id)
    // Not through another market's id.
    expect(
      await findSocialSource(pg, { contractId: 'other', commentId: 'c1' })
    ).toBeNull()
    expect((await findSocialSource(pg, { postId: card.id }))!.id).toBe(card.id)
  })
})

describe('the number of replies shown on a post', () => {
  beforeEach(migrate)
  const counts = async (ids: string[], blocked: string[] = []) =>
    Object.fromEntries(
      (await socialReplyCounts(pg, ids, blocked)).map((r) => [
        r.parent_id,
        r.count,
      ])
    )

  test('counts posts under it, what a card lists from elsewhere, and replies not copied yet, each once', async () => {
    // Shared before the market had a card, so it is its own thread.
    await insertComment('b', { user: 'bob' })
    await ensureSocialSource(pg, { contractId: 'market', commentId: 'b' })
    const card = await ensureSocialSource(pg, { contractId: 'market' })
    await insertComment('a')
    await ensureMarketCommentPost(pg, 'a')
    await insertComment('c')
    await insertComment('staff-hidden', { data: { hidden: true } })
    await insertComment('a1', { user: 'bob', data: { replyToCommentId: 'a' } })
    await ensureMarketCommentPost(pg, 'a1')
    await insertComment('a2', {
      user: 'carol',
      data: { replyToCommentId: 'a' },
    })
    // A reply written on Yap with no market comment.
    await rows(
      `insert into social_posts (id, user_id, text, root_id, parent_id, feed_visible)
       values ('yap-reply', 'dave', 'hi', $1, 'mc-a', false)`,
      [card.id]
    )
    // A trade with its own card: one comment on it copied, one not yet.
    await rows(
      `insert into contract_bets (bet_id, contract_id, user_id) values ('bet1', 'market', 'bob')`
    )
    const trade = await ensureSocialSource(pg, {
      contractId: 'market',
      betId: 'bet1',
    })
    await insertComment('t1', { user: 'carol', data: { betId: 'bet1' } })
    await ensureMarketCommentPost(pg, 't1')
    await insertComment('t2', { user: 'carol', data: { betId: 'bet1' } })
    expect((await post('mc-b'))!.parent_id).toBeNull()
    expect((await post('mc-t1'))!.parent_id).toBe(trade.id)

    expect(
      await counts([card.id, trade.id, 'mc-a', 'mc-b', 'mc-a1', 'yap-reply'])
    ).toEqual({
      // a under it; b and t1 listed from other threads; c and t2 not copied.
      [card.id]: 5,
      // t1 under it; t2 not copied.
      [trade.id]: 2,
      // a1 and the Yap reply under it; a2 not copied.
      'mc-a': 3,
      'mc-b': 0,
      'mc-a1': 0,
      'yap-reply': 0,
    })
    // Someone who has blocked bob is not shown his posts or the thread of his
    // trade, so b, t1 and a1 do not count.
    expect(await counts([card.id, 'mc-a'], ['bob'])).toEqual({
      [card.id]: 3,
      'mc-a': 2,
    })
  })

  test('reads the posts table through its indexes', async () => {
    const card = await ensureSocialSource(pg, { contractId: 'market' })
    await insertComment('a')
    await ensureMarketCommentPost(pg, 'a')
    const statements: string[] = []
    const recording = {
      ...client,
      manyOrNone: (sql: string, params?: unknown) => {
        statements.push(pgp.as.format(sql, params))
        return client.manyOrNone(sql, params)
      },
    } as unknown as SupabaseDirectClient
    await socialReplyCounts(recording, [card.id, 'mc-a'], [])
    // These tables are tiny, so price sequential scans out and look at what is
    // left. Every read of the posts table must be narrowed by an index
    // condition. A read with only a filter, whether it walks the table or a
    // whole index, is one read of every post for each post on the page.
    await db.exec('set enable_seqscan = off')
    type PlanNode = Record<string, unknown> & { Plans?: PlanNode[] }
    const raw = (await rows(`explain (format json) ${statements[0]}`))[0][
      'QUERY PLAN'
    ]
    const tree = (typeof raw === 'string' ? JSON.parse(raw) : raw) as {
      Plan: PlanNode
    }[]
    const nodes = (node: PlanNode): PlanNode[] => [
      node,
      ...(node.Plans ?? []).flatMap(nodes),
    ]
    const reads = nodes(tree[0].Plan).filter(
      (node) => node['Relation Name'] === 'social_posts'
    )
    // The post asked about, its thread, and the posts counted under it.
    expect(reads.length).toBeGreaterThanOrEqual(4)
    expect(
      reads
        .filter((node) => !node['Index Cond'] && !node['Recheck Cond'])
        .map((node) => `${node['Node Type']} on ${node['Alias']}`)
    ).toEqual([])
  })
})

describe('the follows written by 2026111201_social_discussions.sql', () => {
  const follows = async () =>
    (
      await rows(
        `select root_id || '/' || user_id as f from social_thread_subscriptions order by 1`
      )
    ).map((row) => row.f as string)

  test('are for people who posted on Yap, and for no one else when it runs again', async () => {
    await db.exec(migration(MARKET_COMMENT))
    await rows(
      `insert into social_posts (id, user_id, text, root_id, parent_id)
       values ('yap', 'alice', 'yap', 'yap', null), ('yap-reply', 'bob', 'reply', 'yap', 'yap')`
    )
    await db.exec(migration(DISCUSSIONS))
    expect(await follows()).toEqual(['yap/alice', 'yap/bob'])

    // The new API is live: a market card, a comment copied by a read, and a
    // Yap that also commented on the market.
    await insertComment('old', { user: 'carol' })
    const card = await ensureSocialSource(pg, { contractId: 'market' })
    await pg.tx((tx) => reconcileMarketDiscussion(tx, card))
    expect(await post('mc-old')).toBeTruthy()
    await insertComment('c-own', { user: 'dave' })
    await rows(
      `insert into social_posts (id, user_id, text, root_id, market_comment_id)
       values ('own', 'dave', 'own', 'own', 'c-own')`
    )

    await db.exec(migration(DISCUSSIONS))
    // dave posted on Yap. carol only commented on the market, and the market's
    // creator did not put the card there.
    expect(await follows()).toEqual(['own/dave', 'yap/alice', 'yap/bob'])
  })
})

describe('the reaction part of 2026111201_social_discussions.sql', () => {
  const seedPosts = (linked: boolean) =>
    rows(
      `insert into social_posts (id, user_id, text, root_id${
        linked ? ', market_comment_id' : ''
      }) values ${[
        'only-yap',
        'both',
        'not-a-like',
        'ghost',
        'later-like',
        'later-dislike',
        'twice',
      ]
        .map(
          (id) =>
            `('${id}', 'alice', '${id}', '${id}'${
              linked ? `, '${id === 'ghost' ? 'missing' : 'c-' + id}'` : ''
            })`
        )
        .join(', ')}, ('plain', 'alice', 'plain', 'plain'${
        linked ? ', null' : ''
      })`
    )
  const seedReactions = async () => {
    for (const id of [
      'only-yap',
      'both',
      'not-a-like',
      'later-like',
      'later-dislike',
      'twice',
    ])
      await insertComment(`c-${id}`)
    await insertComment('c-untouched')
    await react('only-yap', 'social_post', 'bob')
    await react('both', 'social_post', 'bob')
    await react('c-both', 'comment', 'bob')
    await react('both', 'social_post', 'carol')
    // Only the schema allows this one; no version of the API has written it.
    await react('not-a-like', 'social_post', 'bob', 'dislike')
    await react('ghost', 'social_post', 'bob')
    await react('missing', 'comment', 'bob', 'dislike')
    await react(
      'later-like',
      'social_post',
      'bob',
      'like',
      '2026-11-02T00:00:00Z'
    )
    await react(
      'c-later-like',
      'comment',
      'bob',
      'dislike',
      '2026-11-01T00:00:00Z'
    )
    await react(
      'later-dislike',
      'social_post',
      'bob',
      'like',
      '2026-11-01T00:00:00Z'
    )
    await react(
      'c-later-dislike',
      'comment',
      'bob',
      'dislike',
      '2026-11-02T00:00:00Z'
    )
    await react(
      'c-later-dislike',
      'comment',
      'bob',
      'like',
      '2026-10-01T00:00:00Z'
    )
    // The market path can leave two like rows for one person.
    await react('c-twice', 'comment', 'dave')
    await react('c-twice', 'comment', 'dave')
    await react('twice', 'social_post', 'carol')
    await react('plain', 'social_post', 'bob')
    await react('c-untouched', 'comment', 'carol')
    await rows(
      `update contract_comments cc set
         likes = (select count(*) from user_reactions r where r.content_id = cc.comment_id and r.content_type = 'comment' and r.reaction_type = 'like'),
         dislikes = (select count(*) from user_reactions r where r.content_id = cc.comment_id and r.content_type = 'comment' and r.reaction_type = 'dislike')`
    )
  }

  test('changes nothing where no post is linked, as on a database that has neither migration', async () => {
    await seedPosts(false)
    await seedReactions()
    const before = [
      await reactions(),
      await rows(
        'select comment_id, likes, dislikes from contract_comments order by 1'
      ),
    ]
    await migrate()
    expect([
      await reactions(),
      await rows(
        'select comment_id, likes, dislikes from contract_comments order by 1'
      ),
    ]).toEqual(before)
    expect(await count('social_posts', 'market_comment_id is not null')).toBe(0)
  })

  test('moves likes to the comment, and removes a Yap like only once the person has a reaction there', async () => {
    await db.exec(migration(MARKET_COMMENT))
    await seedPosts(true)
    await seedReactions()
    await db.exec(migration(DISCUSSIONS))
    const after = await reactions()

    // Liked on Yap only: the like is the comment's now.
    expect(after).toContain('comment/c-only-yap/bob/like')
    expect(after).not.toContain('social_post/only-yap/bob/like')
    // Liked on both: one like. Someone else's Yap like joins it.
    expect(after.filter((r) => r.startsWith('comment/c-both/'))).toEqual([
      'comment/c-both/bob/like',
      'comment/c-both/carol/like',
    ])
    // Not a like: nothing equivalent to write, so it is left where it is.
    expect(after).toContain('social_post/not-a-like/bob/dislike')
    expect(after.filter((r) => r.startsWith('comment/c-not-a-like/'))).toEqual(
      []
    )
    // No comment row to move it to: left where it is, and not copied to an id
    // with no comment.
    expect(after).toContain('social_post/ghost/bob/like')
    expect(after.filter((r) => r.includes('/missing/'))).toEqual([
      'comment/missing/bob/dislike',
    ])
    // A like on Yap after a dislike on the market: the like stands, alone.
    expect(after.filter((r) => r.startsWith('comment/c-later-like/'))).toEqual([
      'comment/c-later-like/bob/like',
    ])
    // A dislike on the market after a like on Yap: the dislike stands, alone.
    expect(
      after.filter((r) => r.startsWith('comment/c-later-dislike/'))
    ).toEqual(['comment/c-later-dislike/bob/dislike'])
    expect(after).not.toContain('social_post/later-dislike/bob/like')
    // A post with no market comment, and a comment with no post: untouched.
    expect(after).toContain('social_post/plain/bob/like')
    expect(after).toContain('comment/c-untouched/carol/like')

    // Counters are people, not rows.
    expect(await counters('c-only-yap')).toEqual({ likes: 1, dislikes: 0 })
    expect(await counters('c-both')).toEqual({ likes: 2, dislikes: 0 })
    expect(await counters('c-later-like')).toEqual({ likes: 1, dislikes: 0 })
    expect(await counters('c-later-dislike')).toEqual({ likes: 0, dislikes: 1 })
    expect(await counters('c-twice')).toEqual({ likes: 2, dislikes: 0 })
    expect(await counters('c-untouched')).toEqual({ likes: 1, dislikes: 0 })
  })

  test('can run again after the new API is live', async () => {
    await db.exec(migration(MARKET_COMMENT))
    await seedPosts(true)
    await seedReactions()
    await db.exec(migration(DISCUSSIONS))
    const settled = [await reactions(), await counters('c-both')]

    // What the new API writes: a Yap that quotes a comment and also comments
    // has a parent and is in the feed. A plain reply is not.
    await insertComment('c-quote')
    await rows(
      `insert into social_posts (id, user_id, text, root_id, parent_id, market_comment_id, feed_visible)
       values ('quote', 'carol', 'quote', 'both', 'both', 'c-quote', true),
              ('reply', 'carol', 'reply', 'both', 'both', null, false)`
    )
    // A like taken by an instance still running the old code.
    await react('only-yap', 'social_post', 'dave')

    await db.exec(migration(DISCUSSIONS))
    expect((await post('quote'))!.feed_visible).toBe(true)
    expect((await post('reply'))!.feed_visible).toBe(false)
    const again = await reactions()
    expect(again).toContain('comment/c-only-yap/dave/like')
    expect(again).not.toContain('social_post/only-yap/dave/like')
    expect(await counters('c-only-yap')).toEqual({ likes: 2, dislikes: 0 })
    // Everything else is as the first run left it.
    expect(again.filter((r) => r !== 'comment/c-only-yap/dave/like')).toEqual(
      settled[0]
    )
    expect(await counters('c-both')).toEqual(settled[1])
  })
})
