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
import {
  commentToYapContent,
  ensureMarketCommentPost,
  ensureSocialSource,
  findSocialSource,
  isCommentYapRepresentable,
  linkCommentToOpenDiscussion,
  marketReplyTarget,
  materializeSocialPost,
  syncSocialPostFromComment,
} from './social-discussion'
import {
  SocialRow,
  hydrateSocialPosts,
  socialReplyCounts,
  socialReplyMentionAuthors,
  deleteSocialPostAlerts,
} from './social-posts'
import { SupabaseDirectClient } from './supabase/init'
import { log } from './utils'

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

describe('adding a market to Yap, and the comments it already has', () => {
  beforeEach(migrate)

  test('comments that cannot be on Yap get no post, and the rest get theirs when someone acts on them', async () => {
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

    // Reading makes no posts. Someone acts on each comment in turn: the ones
    // that can be on Yap get their posts, and the rest are refused.
    const made: string[] = []
    for (const id of [
      'plain',
      'long',
      'hidden',
      'under-hidden',
      'deleted',
      'under-deleted',
      'mod',
      'under-mod',
      'reply',
    ])
      await pg
        .tx((tx) => materializeSocialPost(tx, 'mc-' + id))
        .then(
          () => made.push(id),
          (e) => expect(e).toMatchObject({ code: 404 })
        )
    expect(made).toEqual(['plain', 'long', 'reply'])
    expect(
      (
        await rows(
          'select market_comment_id from social_posts where market_comment_id is not null order by 1'
        )
      ).map((r) => r.market_comment_id)
    ).toEqual(['long', 'plain', 'reply'])
    // The market keeps the long comment whole; Yap shows what it can hold.
    const long = (await post('mc-long'))!
    expect([...long.text]).toHaveLength(2000)
    expect((await post('mc-plain'))!.parent_id).toBe(card.id)
    expect((await post('mc-reply'))!.parent_id).toBe('mc-plain')
    expect(log.warn).not.toHaveBeenCalled()
  })

  test('a reply under a post that was removed from Yap, or hidden there, stays on the market only', async () => {
    await ensureSocialSource(pg, { contractId: 'market' })
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
    // Someone acts on each reply. Only the one under an open post is on Yap.
    for (const id of ['open', 'removed', 'hidden-on-yap'])
      await pg
        .tx((tx) => materializeSocialPost(tx, 'mc-under-' + id))
        .catch((e) => expect(e).toMatchObject({ code: 404 }))
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

  test('sharing a comment in a circle of replies is refused, not followed for ever', async () => {
    // Older data: two comments that reply to each other, one that replies to
    // itself, and a reply that hangs off the pair.
    await insertComment('first', { data: { replyToCommentId: 'second' } })
    await insertComment('second', { data: { replyToCommentId: 'first' } })
    await insertComment('own', { data: { replyToCommentId: 'own' } })
    await insertComment('under-first', { data: { replyToCommentId: 'first' } })
    const inCircle = ['first', 'second', 'own', 'under-first']
    // Placing a comment takes a handful of statements. They are counted here,
    // so that going round the circle fails this test instead of never ending.
    let statements = 0
    const counting = Object.fromEntries(
      Object.entries(client).map(([name, run]) => [
        name,
        (...args: unknown[]) => {
          if (++statements > 40)
            throw new Error('went round the circle of replies')
          return (run as (...args: unknown[]) => unknown)(...args)
        },
      ])
    ) as unknown as SupabaseDirectClient
    for (const id of inCircle) {
      statements = 0
      await expect(ensureMarketCommentPost(counting, id)).rejects.toMatchObject(
        {
          code: 404,
          message: 'This comment is unavailable',
        }
      )
    }
    // The same through a share, in its transaction, with and without a card.
    for (const withCard of [false, true]) {
      if (withCard) await ensureSocialSource(pg, { contractId: 'market' })
      for (const id of inCircle)
        await expect(
          pg.tx((tx) =>
            ensureSocialSource(tx, { contractId: 'market', commentId: id })
          )
        ).rejects.toMatchObject({ code: 404 })
    }
    expect(await count('social_posts', 'market_comment_id is not null')).toBe(0)

    // A thread with no circle in it is placed as before, reply to reply too.
    await insertComment('top')
    await insertComment('reply', { data: { replyToCommentId: 'top' } })
    await insertComment('deeper', { data: { replyToCommentId: 'reply' } })
    const deeper = await pg.tx((tx) =>
      ensureSocialSource(tx, { contractId: 'market', commentId: 'deeper' })
    )
    expect(deeper.parent_id).toBe('mc-reply')
    expect((await post('mc-reply'))!.parent_id).toBe('mc-top')
  })

  test('sharing a comment its author took off Yap says so, to a sharer with no block; other refusals stay general', async () => {
    for (const id of ['mine', 'moderated', 'hidden-on-yap']) {
      await insertComment(id)
      await ensureMarketCommentPost(pg, id)
      await insertComment(`under-${id}`, { data: { replyToCommentId: id } })
    }
    await rows(`update social_posts set deleted_time=now() where id='mc-mine'`)
    // A moderator's removal deletes the market comment as well.
    await rows(
      `update social_posts set deleted_time=now(), removed_by_moderator=true where id='mc-moderated'`
    )
    await rows(
      `update contract_comments set data=data || '{"deleted":true}' where comment_id='moderated'`
    )
    await rows(
      `update social_posts set hidden_time=now() where id='mc-hidden-on-yap'`
    )
    // A reply in someone else's thread: bob's comment, and carol's reply to it,
    // which carol took off Yap.
    await insertComment('bobs', { user: 'bob' })
    await insertComment('carols', {
      user: 'carol',
      data: { replyToCommentId: 'bobs' },
    })
    await ensureMarketCommentPost(pg, 'carols')
    await rows(
      `update social_posts set deleted_time=now() where id='mc-carols'`
    )
    const share = (commentId: string, blocked: string[] = []) =>
      pg.tx((tx) =>
        ensureSocialSource(
          tx,
          { contractId: 'market', commentId },
          { id: 'dave', blocked }
        )
      )
    await expect(share('mine')).rejects.toMatchObject({
      code: 403,
      message: "This comment's author took it off Yap",
    })
    // Not to someone who has a block with the author (alice wrote it).
    await expect(share('mine', ['alice'])).rejects.toMatchObject({
      code: 403,
      message: 'This discussion is closed',
    })
    // Nor to someone who has a block with the author of the thread it is in.
    // Yap shows that person nothing of the thread.
    await expect(share('carols')).rejects.toMatchObject({
      code: 403,
      message: "This comment's author took it off Yap",
    })
    await expect(share('carols', ['bob'])).rejects.toMatchObject({
      code: 403,
      message: 'This discussion is closed',
    })
    await expect(share('carols', ['carol'])).rejects.toMatchObject({
      code: 403,
      message: 'This discussion is closed',
    })
    // Nor to a caller that is not a person sharing: a read, or a new comment.
    await expect(
      pg.tx((tx) => ensureMarketCommentPost(tx, 'mine', 'market'))
    ).rejects.toMatchObject({ code: 403, message: 'This discussion is closed' })
    // A moderator's removal or hide is not explained.
    await expect(share('moderated')).rejects.toMatchObject({
      code: 404,
      message: 'This comment is unavailable',
    })
    await expect(share('hidden-on-yap')).rejects.toMatchObject({
      code: 403,
      message: 'This discussion is closed',
    })
    // A reply under any of them: "this comment" would name the wrong one.
    for (const id of ['mine', 'moderated', 'hidden-on-yap'])
      await expect(share(`under-${id}`)).rejects.toMatchObject({
        message: expect.not.stringContaining('took it off Yap'),
      })
    // The reason is about a comment on the market named: not about one found
    // by its id on another market.
    await expect(
      pg.tx((tx) =>
        ensureSocialSource(
          tx,
          { contractId: 'other', commentId: 'mine' },
          { id: 'dave', blocked: [] }
        )
      )
    ).rejects.toMatchObject({ code: 404 })
    expect(await count('social_posts')).toBe(5)
  })

  test('a copy made because someone else acted on the comment, or shared it, does not make the author follow the thread', async () => {
    await insertComment('old', { user: 'bob' })
    await insertComment('reply', {
      user: 'carol',
      data: { replyToCommentId: 'old' },
    })
    await ensureSocialSource(pg, { contractId: 'market' })
    // Someone acts on the reply, which gives it and the comment above it
    // their posts.
    await pg.tx((tx) => materializeSocialPost(tx, 'mc-reply'))
    expect(await post('mc-old')).toBeTruthy()
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
    // One written earlier, given its post when someone acts on it.
    await insertComment('older', { data: { betId: 'bet1' } })
    await pg.tx((tx) => materializeSocialPost(tx, 'mc-older'))
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

describe('the market comment that a reply written on Yap is put under', () => {
  const target = (commentId: string, contract = 'market') =>
    marketReplyTarget(pg, contract, commentId)
  const reply = (id: string, to: string, contract = 'market') =>
    insertComment(id, { contract, data: { replyToCommentId: to } })

  test('is the top-level comment of the thread, however deep the comment answered sits', async () => {
    await insertComment('top')
    await reply('reply', 'top')
    // Older data: replies to replies, which the market no longer takes.
    await reply('deeper', 'reply')
    await reply('deepest', 'deeper')
    for (const id of ['top', 'reply', 'deeper', 'deepest'])
      expect(await target(id)).toBe('top')
    // An empty reply id is no reply id, as where comments are written.
    await reply('blank', '')
    await reply('under-blank', 'blank')
    expect(await target('blank')).toBe('blank')
    expect(await target('under-blank')).toBe('blank')
  })

  test("is looked for on the comment's own market only", async () => {
    // The same ids on another market, where the thread leads somewhere else.
    await insertComment('top', { contract: 'other' })
    await reply('reply', 'top', 'other')
    await insertComment('top')
    await insertComment('second-top')
    await reply('reply', 'second-top')
    expect(await target('reply')).toBe('second-top')
    expect(await target('reply', 'other')).toBe('top')
    // A reply whose parent is on the other market only has no way up here,
    // though that parent has one there.
    await insertComment('far-top', { contract: 'other' })
    await reply('elsewhere', 'far-top', 'other')
    await reply('stray', 'elsewhere')
    expect(await target('stray')).toBe('elsewhere')
    // And a comment asked for on a market it is not on is not found.
    expect(await target('stray', 'other')).toBe('stray')
  })

  test('is the comment replied to, as before, where the way up has no top: the market then refuses the write', async () => {
    // The comment replied to is gone.
    await reply('orphan', 'gone')
    expect(await target('orphan')).toBe('gone')
    // Replies that go round in a circle.
    await reply('first', 'second')
    await reply('second', 'first')
    await reply('own', 'own')
    await reply('under-first', 'first')
    expect(await target('first')).toBe('second')
    expect(await target('second')).toBe('first')
    expect(await target('own')).toBe('own')
    expect(await target('under-first')).toBe('first')
    // A comment that does not exist.
    expect(await target('nobody')).toBe('nobody')
  })

  test('goes up fifty comments and no further', async () => {
    await insertComment('c1')
    for (let i = 2; i <= 51; i++) await reply(`c${i}`, `c${i - 1}`)
    expect(await target('c50')).toBe('c1')
    expect(await target('c51')).toBe('c50')
  })
})

describe('whose comment a reply mention names', () => {
  beforeEach(migrate)

  test('the author of that comment, when it is on the same market', async () => {
    await insertComment('top', { user: 'bob' })
    await insertComment('reply', {
      user: 'carol',
      data: { replyToCommentId: 'top' },
    })
    await insertComment('sibling', {
      user: 'dave',
      data: { replyToCommentId: 'top' },
    })
    await insertComment('elsewhere', { contract: 'other', user: 'alice' })
    const found = async (...pairs: [string, string][]) =>
      (await socialReplyMentionAuthors(pg, pairs))
        .map((r) => `${r.comment_id} mentions ${r.mention_id}: ${r.user_id}`)
        .sort()
    // The comment replied to, and another reply in the thread.
    expect(await found(['reply', 'top'], ['sibling', 'reply'])).toEqual([
      'reply mentions top: bob',
      'sibling mentions reply: carol',
    ])
    // A comment on another market, a user's id and an id that is nothing.
    expect(
      await found(
        ['reply', 'elsewhere'],
        ['reply', 'bob'],
        ['reply', 'nothing']
      )
    ).toEqual([])
    // Nothing to look up sends no query.
    expect(await socialReplyMentionAuthors(pg, [])).toEqual([])
  })

  test('each comment is found by its own id, not by reading its market', async () => {
    // The two indexes of the real table that this lookup can choose between,
    // and enough comments for the choice to show: ten on each of 2,000 markets.
    await db.exec(`
      create index contract_comments_id on contract_comments (comment_id);
      create index contract_comments_contract_id_created_time_idx
        on contract_comments (contract_id, created_time desc);
      insert into contract_comments (contract_id, comment_id, user_id, created_time, data)
      select 'm' || (g % 2000), 'c' || g, 'alice', now(), '{}'
      from generate_series(1, 20000) g;
      analyze contract_comments;
    `)
    const statements: string[] = []
    const recording = {
      ...client,
      manyOrNone: (sql: string, params?: unknown) => {
        statements.push(pgp.as.format(sql, params))
        return client.manyOrNone(sql, params)
      },
    } as unknown as SupabaseDirectClient
    // c5 and c2005 are on one market, c6 is on the next.
    expect(
      await socialReplyMentionAuthors(recording, [
        ['c5', 'c2005'],
        ['c5', 'c6'],
      ])
    ).toEqual([{ comment_id: 'c5', mention_id: 'c2005', user_id: 'alice' }])
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
      (node) => node['Relation Name'] === 'contract_comments'
    )
    // The comment the mention is in, and the comment it names. A read whose
    // index condition is the market alone goes through every comment on it.
    expect(reads).toHaveLength(2)
    expect(
      reads
        .map((node) => String(node['Index Cond']))
        .filter((condition) => !condition.includes('comment_id'))
    ).toEqual([])
  })
})

describe('reading copied comments back from the tables', () => {
  beforeEach(async () => {
    await migrate()
    // What a read needs beyond the tables above: who people are, and what a
    // market's card shows.
    await db.exec(`
      alter table users add column name text, add column username text,
        add column data jsonb not null default '{}';
      update users set name = initcap(id), username = id;
      create table user_entitlements (
        user_id text not null, entitlement_id text not null,
        granted_time timestamptz not null default now(), expires_time timestamptz,
        enabled boolean not null default true, auto_renew boolean not null default false,
        metadata jsonb, primary key (user_id, entitlement_id)
      );
      alter table contract_bets add column data jsonb not null default '{}';
      update contracts set data = jsonb_build_object(
        'id', id, 'slug', id, 'creatorUsername', creator_id, 'question', 'Will it?');
    `)
    // Alice's comment, Bob's reply to it, and Carol's reply to Bob, written
    // with the market's Reply button: the mention carries the id of Bob's
    // COMMENT and the username he had then.
    await insertComment('top', { user: 'alice' })
    await insertComment('first', {
      user: 'bob',
      data: { replyToCommentId: 'top' },
    })
    await insertComment('second', {
      user: 'carol',
      data: { replyToCommentId: 'top' },
      content: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'mention', attrs: { id: 'first', label: 'bob' } },
              { type: 'text', text: ' agreed' },
            ],
          },
        ],
      },
    })
    for (const id of ['top', 'first', 'second'])
      await ensureMarketCommentPost(pg, id)
    // Since then Bob renamed himself, and Dave took the name he left.
    await rows(`update users set username='bobby' where id='bob'`)
    await rows(`update users set username='bob' where id='dave'`)
  })
  // Rows as the API's database client returns them: timestamps as text.
  const row = async (id: string) =>
    (
      await rows('select to_jsonb(p) as row from social_posts p where id=$1', [
        id,
      ])
    )[0].row as SocialRow
  const read = async (blocked: string[] = [], reader = pg) =>
    hydrateSocialPosts(
      reader,
      [await row('mc-top'), await row('mc-second')],
      { blocked },
      false
    )

  test('a reply names the author of the comment it replies to, and a comment that starts a thread shows its market', async () => {
    const [top, second] = await read()
    expect(top.removed).toBeNull()
    expect(second.text).toBe('@bobby agreed')
    expect(second.richContent?.content?.[0].content?.[0]).toEqual({
      type: 'mention',
      attrs: { id: 'bob', label: 'bobby' },
    })
    expect(top.source?.markets?.map((m) => m.id)).toEqual(['market'])
    expect(second.source?.markets).toBeUndefined()

    // A reader with a block against Bob is not told his name; one with a
    // block against the market's creator still reads the comments, without
    // the creator's market.
    expect((await read(['bob']))[1].text).toBe('[User unavailable] agreed')
    const [behindBlock, reply] = await read(['owner'])
    expect(behindBlock.removed).toBeNull()
    expect(behindBlock.source?.markets).toBeUndefined()
    expect(reply.text).toBe('@bobby agreed')

    // The same mention on another market's comment names nobody there.
    await insertComment('far', {
      contract: 'other',
      user: 'carol',
      content: (
        await rows(
          `select data->'content' as c from contract_comments where comment_id='second'`
        )
      )[0].c,
    })
    await ensureMarketCommentPost(pg, 'far')
    // Read together with the reply it was copied from: each is resolved
    // against its own market.
    expect(
      (
        await hydrateSocialPosts(
          pg,
          [await row('mc-second'), await row('mc-far')],
          { blocked: [] },
          false
        )
      ).map((p) => p.text)
    ).toEqual(['@bobby agreed', '[User unavailable] agreed'])
  })

  test('the users it needs are found by their ids, not by reading the users table', async () => {
    const statements: string[] = []
    const recording = {
      ...client,
      manyOrNone: (sql: string, params?: unknown) => {
        statements.push(pgp.as.format(sql, params))
        return client.manyOrNone(sql, params)
      },
    } as unknown as SupabaseDirectClient
    await read([], recording)
    const lookup = statements.filter((sql) =>
      sql.startsWith('select id, name, username, data')
    )
    expect(lookup).toHaveLength(1)
    // The table is tiny, so price sequential scans out and see what is left:
    // a condition the primary key can serve, or a walk of every user.
    await db.exec('set enable_seqscan = off')
    type PlanNode = Record<string, unknown> & { Plans?: PlanNode[] }
    const raw = (await rows(`explain (format json) ${lookup[0]}`))[0][
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
      (node) => node['Relation Name'] === 'users'
    )
    expect(reads.length).toBeGreaterThanOrEqual(1)
    expect(
      reads
        .filter((node) => !node['Index Cond'] && !node['Recheck Cond'])
        .map((node) => `${node['Node Type']} on ${node['Alias']}`)
    ).toEqual([])
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

  test('counts posts under it, what a card lists from elsewhere, and comments that have no post yet, each once', async () => {
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
      // a under it; b and t1 listed from other threads; c and t2 have no post.
      [card.id]: 5,
      // t1 under it; t2 has no post.
      [trade.id]: 2,
      // a1 and the Yap reply under it; a2 has no post.
      'mc-a': 3,
      'mc-b': 0,
      'mc-a1': 0,
      'yap-reply': 0,
    })
    // Someone who has blocked bob is not shown his posts or the thread of his
    // trade, so b, t1 and a1 do not count. Nor does t2: it has no post yet,
    // and the one it gets will sit in the thread of bob's trade, where this
    // reader would not be shown it.
    expect(await counts([card.id, 'mc-a'], ['bob'])).toEqual({
      [card.id]: 2,
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
    // And each post that is counted is found by what it is counted for: the
    // post it sits under, or the comment it is the copy of. A condition on
    // anything else would pass the check above and could still read them all.
    const conditions = (alias: string) =>
      reads
        .filter((node) => String(node['Alias']).replace(/_\d+$/, '') === alias)
        .map((node) => String(node['Index Cond']))
    const byParent = /^\(parent_id = \w+\.id\)$/
    const byComment = /^\(market_comment_id = \w+\.comment_id\)$/
    expect(conditions('p').sort()).toEqual([
      expect.stringMatching(byComment),
      expect.stringMatching(byParent),
    ])
    expect(conditions('child')).toEqual([
      expect.stringMatching(byParent),
      expect.stringMatching(byParent),
    ])
    expect(conditions('copied')).toEqual([
      expect.stringMatching(byComment),
      expect.stringMatching(byComment),
    ])
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

    // The new API is live: a market card, a comment given its post because
    // someone acted on it, and a Yap that also commented on the market.
    await insertComment('old', { user: 'carol' })
    await ensureSocialSource(pg, { contractId: 'market' })
    await pg.tx((tx) => materializeSocialPost(tx, 'mc-old'))
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

  test('running again writes only the comments whose counts are wrong', async () => {
    await db.exec(migration(MARKET_COMMENT))
    await seedPosts(true)
    await seedReactions()
    await db.exec(migration(DISCUSSIONS))
    // Each row version carries the transaction that wrote it.
    const versions = async () =>
      Object.fromEntries(
        (
          await rows(
            'select comment_id, xmin::text as version from contract_comments'
          )
        ).map((row) => [row.comment_id as string, row.version as string])
      )
    const first = await versions()

    await db.exec(migration(DISCUSSIONS))
    expect(await versions()).toEqual(first)

    // A like the counter missed, and a counter that is wrong with no vote behind it.
    await react('c-both', 'comment', 'dave')
    await rows(
      `update contract_comments set dislikes=7 where comment_id='c-twice'`
    )
    const before = await versions()
    await db.exec(migration(DISCUSSIONS))
    const after = await versions()
    expect(await counters('c-both')).toEqual({ likes: 3, dislikes: 0 })
    expect(await counters('c-twice')).toEqual({ likes: 2, dislikes: 0 })
    expect(
      Object.keys(after)
        .filter((id) => after[id] !== before[id])
        .sort()
    ).toEqual(['c-both', 'c-twice'])
    // A comment with no post is never recounted, right or wrong.
    await rows(
      `update contract_comments set likes=9 where comment_id='c-untouched'`
    )
    await db.exec(migration(DISCUSSIONS))
    expect(await counters('c-untouched')).toEqual({ likes: 9, dislikes: 0 })
  })
})

describe('the alerts taken back when a post is taken off Yap', () => {
  beforeEach(async () => {
    // As in backend/supabase/user_notifications.sql: the key and the index on
    // the alert's id.
    await db.exec(`
      create table user_notifications (
        data jsonb not null,
        notification_id text not null,
        user_id text not null,
        primary key (user_id, notification_id)
      );
      create index user_notifications_notification_id on user_notifications (notification_id, user_id);
    `)
  })

  // The alerts as Yap writes them (notifySocial, repostSocialPost,
  // notifySocialMentions), and as it wrote them before 21 Nov 2026.
  type Alert = {
    to: string
    id: string
    sourceId: string
    slug: string
    type: string
  }
  const like = (post: string, author: string, by: string): Alert => ({
    to: author,
    id: `social-like-${post}-${by}`,
    sourceId: post,
    slug: `/yap/${post}`,
    type: 'social_post_like',
  })
  const reYap = (post: string, author: string): Alert => ({
    to: author,
    id: `social-repost-${post}`,
    sourceId: post,
    slug: `/yap/${post}`,
    type: 'social_repost',
  })
  // One alert per thread for each person following it, naming the thread and
  // its latest reply.
  const threadAlert = (thread: string, reply: string, to: string): Alert => ({
    to,
    id: `social-thread-${thread}`,
    sourceId: thread,
    slug: `/yap/${reply}`,
    type: 'social_reply',
  })
  // Before 21 Nov 2026: one alert per reply, to the author of the post replied to.
  const oldReply = (parent: string, to: string, reply: string): Alert => ({
    to,
    id: `social-reply-${reply}`,
    sourceId: parent,
    slug: `/yap/${reply}`,
    type: 'social_reply',
  })
  const mention = (post: string, to: string): Alert => ({
    to,
    id: `social-mention-${post}`,
    sourceId: post,
    slug: `/yap/${post}`,
    type: 'social_mention',
  })
  const insertAlerts = (alerts: Alert[]) =>
    rows(
      `insert into user_notifications (user_id, notification_id, data)
       select a->>'to', a->>'id', jsonb_build_object('sourceId', a->>'sourceId',
         'sourceSlug', a->>'slug', 'sourceType', a->>'type')
       from jsonb_array_elements($1::jsonb) a`,
      [JSON.stringify(alerts)]
    )
  const alertKeys = async () =>
    (
      await rows(
        `select user_id || ' ' || notification_id as k from user_notifications order by 1`
      )
    ).map((r) => r.k as string)

  // A thread started by alice: bob replies to her, carol replies to bob, and
  // dave replies to her last. Another thread by erin.
  const posts = {
    root: { id: 'root', user_id: 'alice', root_id: 'root' },
    reply: { id: 'reply', user_id: 'bob', root_id: 'root' },
    nested: { id: 'nested', user_id: 'carol', root_id: 'root' },
    later: { id: 'later', user_id: 'dave', root_id: 'root' },
    other: { id: 'other', user_id: 'erin', root_id: 'other' },
  }
  const thread: Alert[] = [
    like('root', 'alice', 'bob'),
    like('root', 'alice', 'carol'),
    like('reply', 'bob', 'alice'),
    like('reply', 'bob', 'dave'),
    like('nested', 'carol', 'bob'),
    reYap('root', 'alice'),
    reYap('reply', 'bob'),
    // Followers who last heard of bob's reply, and followers who last heard of
    // dave's.
    threadAlert('root', 'reply', 'alice'),
    threadAlert('root', 'reply', 'frank'),
    threadAlert('root', 'later', 'gina'),
    threadAlert('root', 'later', 'bob'),
    threadAlert('other', 'other-reply', 'bob'),
    oldReply('root', 'alice', 'reply'),
    oldReply('reply', 'bob', 'nested'),
    oldReply('root', 'alice', 'later'),
    oldReply('other', 'erin', 'other-reply'),
    mention('reply', 'carol'),
    mention('root', 'dave'),
    // Not a Yap alert, though it names the post.
    {
      to: 'bob',
      id: 'comment-1',
      sourceId: 'reply',
      slug: '/yap/reply',
      type: 'comment',
    },
  ]

  test('are the ones it used to take back, no more and no fewer', async () => {
    for (const post of Object.values(posts)) {
      await rows('delete from user_notifications')
      await insertAlerts(thread)
      // What the statement this replaces took back, reading every alert: the
      // one #4287 added, without a condition on whom an alert went to.
      const expected = (
        await rows(
          `select user_id || ' ' || notification_id as k from user_notifications
           where (data->>'sourceId'=$1 or data->>'sourceSlug'='/yap/' || $1)
             and data->>'sourceType' in ('social_reply','social_post_like','social_repost')
             or notification_id='social-mention-' || $1
           order by 1`,
          [post.id]
        )
      ).map((r) => r.k as string)
      const before = await alertKeys()
      await deleteSocialPostAlerts(pg, post)
      const after = await alertKeys()
      expect({
        post: post.id,
        gone: before.filter((k) => !after.includes(k)),
      }).toEqual({ post: post.id, gone: expected })
    }
    // What that comes to for bob's reply, written out.
    await rows('delete from user_notifications')
    await insertAlerts(thread)
    await deleteSocialPostAlerts(pg, posts.reply)
    expect(await alertKeys()).toEqual([
      'alice social-like-root-bob',
      'alice social-like-root-carol',
      'alice social-reply-later',
      'alice social-repost-root',
      'bob comment-1',
      'bob social-thread-other',
      'bob social-thread-root',
      'carol social-like-nested-bob',
      'dave social-mention-root',
      'erin social-reply-other-reply',
      'gina social-thread-root',
    ])
  })

  test('are found by whom they went to or by their ids, never by reading every alert', async () => {
    // Enough alerts for PostgreSQL to choose a plan as it would on a large
    // table: 20,000 across 400 people. This in-memory PostgreSQL compares text
    // in the C collation, which lets an index serve a LIKE prefix that a
    // production database would read the table for; the statements here
    // compare with equality only.
    await rows(
      `insert into user_notifications (user_id, notification_id, data)
       select 'u' || (i % 400), 'n' || i, jsonb_build_object('sourceId', 'p' || (i % 997),
         'sourceSlug', '/yap/p' || (i % 991),
         'sourceType', (array['social_reply','social_post_like','social_repost','comment'])[1 + i % 4])
       from generate_series(1, 20000) i`
    )
    await insertAlerts(thread)
    await rows('analyze user_notifications')
    const sent: [string, unknown][] = []
    const recorder = {
      ...client,
      none: async (sql: string, params?: unknown) => {
        sent.push([sql, params])
      },
    } as unknown as SupabaseDirectClient
    await deleteSocialPostAlerts(recorder, posts.reply)
    expect(sent).toHaveLength(3)
    type PlanNode = {
      'Node Type': string
      'Relation Name'?: string
      'Index Name'?: string
      Plans?: PlanNode[]
    }
    const nodes = (node: PlanNode): PlanNode[] => [
      node,
      ...(node.Plans ?? []).flatMap(nodes),
    ]
    for (const [sql, params] of sent) {
      const result = (
        await rows(`explain (format json) ${pgp.as.format(sql, params)}`)
      )[0]['QUERY PLAN']
      const plan = (typeof result === 'string' ? JSON.parse(result) : result)[0]
        .Plan as PlanNode
      const read = nodes(plan).filter(
        (n) =>
          n['Relation Name'] === 'user_notifications' ||
          n['Index Name']?.startsWith('user_notifications')
      )
      expect({ sql, scans: read.map((n) => n['Node Type']) }).toEqual({
        sql,
        scans: expect.not.arrayContaining(['Seq Scan']),
      })
      expect(read.some((n) => n['Index Name'])).toBe(true)
    }
  })
})
