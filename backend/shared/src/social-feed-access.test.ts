jest.mock('./utils', () => ({ LOCAL_ONLY: true, log: { warn: jest.fn() } }))
jest.mock('./supabase/init', () => ({ createSupabaseDirectClient: jest.fn() }))
jest.mock('./social-posts', () => ({
  getSocialViewer: jest.fn(),
  getSocialRow: jest.fn(),
  hydrateSocialPosts: jest.fn(),
}))
jest.mock('api/helpers/rate-limit', () => ({
  onlyUsersWhoCanPerformAction: (_action: string, handler: unknown) => handler,
}))

import { Request, Response } from 'express'
import { API } from 'common/api/schema'
import { ENV_CONFIG, MOD_IDS } from 'common/envs/constants'
import { convertEntitlement } from 'common/shop/types'
import {
  SocialPost,
  SocialPostPage,
  SOCIAL_FEED_PAGE_SIZE,
} from 'common/social-post'
import { AuthedUser, typedEndpoint } from 'api/helpers/endpoint'
import { getSocialPosts, getSocialLikers } from 'api/social-posts'
import { createSupabaseDirectClient } from './supabase/init'
import {
  getSocialViewer,
  getSocialRow,
  hydrateSocialPosts,
  SocialRow,
} from './social-posts'

test('Yap read endpoints reject anonymous requests before invoking handlers', async () => {
  for (const name of [
    'get-social-posts',
    'get-social-post',
    'get-social-likers',
  ] as const) {
    const handler = jest.fn()
    const next = jest.fn()
    await typedEndpoint(name, handler)(
      { get: () => undefined } as unknown as Request,
      {} as Response,
      next
    )
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 401 }))
    expect(handler).not.toHaveBeenCalled()
    expect(API[name].cache).toBe('no-store')
  }
})

test('shared feed cache isolates viewer likes, expires, and bypasses other limits, blocks, and refreshes', async () => {
  jest.useFakeTimers()
  try {
    const reply = {
      id: 'reply',
      liked: false,
      likeCount: 0,
      replyPreviews: [],
    } as unknown as SocialPost
    const post = {
      id: 'post',
      liked: false,
      likeCount: 0,
      replyPreviews: [reply],
    } as unknown as SocialPost
    const manyOrNone = jest.fn(async (sql: string, args: unknown[]) =>
      sql.includes('select content_id')
        ? args[0] === 'alice'
          ? [{ content_id: 'post' }, { content_id: 'reply' }]
          : []
        : [{ id: 'post', created_time: '2026-09-16T00:00:00Z' }]
    )
    jest
      .mocked(createSupabaseDirectClient)
      .mockReturnValue({ manyOrNone } as unknown as ReturnType<
        typeof createSupabaseDirectClient
      >)
    jest.mocked(getSocialViewer).mockImplementation(async (id) => ({
      id,
      blocked: id === 'blocked' ? ['author'] : [],
    }))
    const hydrate = jest.mocked(hydrateSocialPosts).mockResolvedValue([post])
    const read = (
      uid: string,
      useCache = 'true',
      limit = SOCIAL_FEED_PAGE_SIZE
    ) =>
      getSocialPosts(
        API['get-social-posts'].props.parse({ limit, useCache }),
        { uid } as AuthedUser,
        {} as Request
      ) as Promise<SocialPostPage>

    const [alice, bob] = await Promise.all([read('alice'), read('bob')])
    expect(hydrate).toHaveBeenCalledTimes(1)
    expect(manyOrNone).toHaveBeenCalledWith(
      expect.stringContaining('select p.* from social_posts'),
      [null, [], null, null, SOCIAL_FEED_PAGE_SIZE + 1]
    )
    expect(hydrate.mock.calls[0][2]).toEqual({ blocked: [] })
    expect(alice.posts[0].liked).toBe(true)
    expect(alice.posts[0].replyPreviews[0].liked).toBe(true)
    expect(alice.posts[0].likeCount).toBe(1)
    expect(bob.posts[0].liked).toBe(false)
    expect(bob.posts[0].replyPreviews[0].liked).toBe(false)
    expect(post.liked).toBe(false)
    expect(post.likeCount).toBe(0)

    await read('blocked')
    expect(hydrate).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.anything(),
      { id: 'blocked', blocked: ['author'] }
    )
    await read('alice', 'false')
    expect(hydrate).toHaveBeenCalledTimes(3)
    await read('bob')
    expect(hydrate).toHaveBeenCalledTimes(3)
    jest.advanceTimersByTime(30_001)
    await read('bob')
    expect(hydrate).toHaveBeenCalledTimes(4)

    jest.advanceTimersByTime(30_001)
    hydrate.mockRejectedValueOnce(new Error('temporary failure'))
    await expect(read('bob')).rejects.toThrow('temporary failure')
    await read('bob')
    expect(hydrate).toHaveBeenCalledTimes(6)

    // A larger request must read its own page without replacing the feed cache.
    await read('bob', 'true', 30)
    expect(hydrate).toHaveBeenCalledTimes(7)
    expect(manyOrNone).toHaveBeenLastCalledWith(
      expect.stringContaining('select p.* from social_posts'),
      [null, [], null, null, 31]
    )
    await read('bob')
    expect(hydrate).toHaveBeenCalledTimes(7)
  } finally {
    jest.useRealTimers()
  }
})

test('report ID lookups bypass the shared timeline cache and ancestor hydration', async () => {
  const rows = [{ id: 'reported', created_time: '2026-09-16T00:00:00Z' }]
  const manyOrNone = jest.fn().mockResolvedValue(rows)
  jest
    .mocked(createSupabaseDirectClient)
    .mockReturnValue({ manyOrNone } as unknown as ReturnType<
      typeof createSupabaseDirectClient
    >)
  jest
    .mocked(getSocialViewer)
    .mockResolvedValue({ id: 'admin', blocked: ['blocked'] })
  const posts = [{ id: 'reported' }] as SocialPost[]
  const hydrate = jest.mocked(hydrateSocialPosts).mockResolvedValue(posts)
  const result = await getSocialPosts(
    API['get-social-posts'].props.parse({ ids: ['reported', 'missing'] }),
    { uid: 'admin' } as AuthedUser,
    {} as Request
  )
  expect(result).toEqual({ posts, nextCursor: null })
  expect(manyOrNone).toHaveBeenCalledTimes(1)
  expect(hydrate).toHaveBeenLastCalledWith(
    expect.anything(),
    rows,
    { id: 'admin', blocked: ['blocked'] },
    false
  )
  for (const other of [
    { useCache: 'true' },
    { parentId: 'thread' },
    { cursor: '2026-09-16T00:00:00Z|id' },
  ]) {
    expect(
      API['get-social-posts'].props.safeParse({ ids: ['reported'], ...other })
        .success
    ).toBe(false)
  }
})

test('liker pagination applies viewer blocks before limiting results', async () => {
  const entitlement = {
    user_id: 'visible',
    entitlement_id: 'avatar-crown',
    granted_time: '2026-09-01T00:00:00Z',
    expires_time: null,
    enabled: true,
    auto_renew: false,
    metadata: { position: 1 },
  }
  const manyOrNone = jest.fn().mockResolvedValue([
    {
      id: 'visible',
      name: 'Visible',
      username: 'visible',
      entitlements: [entitlement],
      created_time: '2026-09-16 00:00:00.123456+00',
    },
    {
      id: 'next',
      name: 'Next',
      username: 'next',
      created_time: '2026-09-16 00:00:01+00',
    },
  ])
  jest
    .mocked(createSupabaseDirectClient)
    .mockReturnValue({ manyOrNone } as unknown as ReturnType<
      typeof createSupabaseDirectClient
    >)
  jest
    .mocked(getSocialViewer)
    .mockResolvedValue({ id: 'viewer', blocked: ['blocked'] })
  jest
    .mocked(getSocialRow)
    .mockResolvedValue({ user_id: 'author', deleted_time: null } as SocialRow)
  const read = () =>
    getSocialLikers(
      { id: 'post', limit: 1 },
      { uid: 'viewer' } as AuthedUser,
      {} as Request
    )
  expect(await read()).toEqual({
    users: [
      {
        id: 'visible',
        name: 'Visible',
        username: 'visible',
        entitlements: [convertEntitlement(entitlement)],
      },
    ],
    nextCursor: '2026-09-16T00:00:00.123456+00:00|visible',
  })
  expect(getSocialViewer).toHaveBeenLastCalledWith('viewer')
  expect(manyOrNone).toHaveBeenCalledTimes(1)
  expect(manyOrNone).toHaveBeenCalledWith(
    expect.stringContaining('from user_entitlements e where e.user_id=u.id'),
    expect.anything()
  )
  expect(manyOrNone).toHaveBeenCalledWith(
    expect.stringContaining('not (r.user_id=any($5::text[]))'),
    ['post', null, null, 2, ['blocked']]
  )
  jest
    .mocked(getSocialRow)
    .mockResolvedValue({ user_id: 'blocked', deleted_time: null } as SocialRow)
  manyOrNone.mockClear()
  expect(await read()).toEqual({ users: [], nextCursor: null })
  expect(manyOrNone).not.toHaveBeenCalled()
})

test('only admins and moderators can bypass personal blocks for report lookups', async () => {
  const props = API['get-social-posts'].props.parse({
    ids: ['reported'],
    forModeration: 'true',
  })
  const hydrate = jest.mocked(hydrateSocialPosts)
  hydrate.mockClear()
  await expect(
    getSocialPosts(props, { uid: 'ordinary-user' } as AuthedUser, {} as Request)
  ).rejects.toMatchObject({ code: 403 })
  expect(hydrate).not.toHaveBeenCalled()
  const rows = [{ id: 'reported', user_id: 'blocked-author' }] as SocialRow[]
  const manyOrNone = jest.fn().mockResolvedValue(rows)
  jest
    .mocked(createSupabaseDirectClient)
    .mockReturnValue({ manyOrNone } as unknown as ReturnType<
      typeof createSupabaseDirectClient
    >)
  jest
    .mocked(getSocialViewer)
    .mockImplementation(async (id) => ({ id, blocked: ['blocked-author'] }))
  // Exercise the exact viewer passed to hydration, including normal reads by
  // the same moderator: only the explicit moderation request bypasses blocks.
  hydrate.mockImplementation(
    async (_pg, _rows, viewer) =>
      [
        {
          id: 'reported',
          text: viewer.blocked.includes('blocked-author')
            ? ''
            : 'reported content',
          removed: viewer.blocked.includes('blocked-author') ? 'blocked' : null,
        },
      ] as SocialPost[]
  )
  for (const uid of [ENV_CONFIG.adminIds[0], MOD_IDS[0]]) {
    const moderation = (await getSocialPosts(
      props,
      { uid } as AuthedUser,
      {} as Request
    )) as SocialPostPage
    expect(moderation.posts[0]).toMatchObject({
      text: 'reported content',
      removed: null,
    })
    expect(hydrate).toHaveBeenLastCalledWith(
      expect.anything(),
      rows,
      { id: uid, blocked: [] },
      false
    )
    const normal = (await getSocialPosts(
      API['get-social-posts'].props.parse({ ids: ['reported'] }),
      { uid } as AuthedUser,
      {} as Request
    )) as SocialPostPage
    expect(normal.posts[0]).toMatchObject({ text: '', removed: 'blocked' })
  }
  for (const params of [
    { forModeration: 'true' },
    { forModeration: 'true', ids: ['reported'], useCache: 'true' },
    { forModeration: 'true', ids: ['reported'], parentId: 'thread' },
  ])
    expect(API['get-social-posts'].props.safeParse(params).success).toBe(false)
})

test('only Yap reposts may be created with an empty comment and no attachments', () => {
  const schema = API['create-social-post'].props
  expect(schema.safeParse({ content: { text: '' } }).success).toBe(false)
  expect(
    schema.safeParse({
      content: { text: '' },
      source: { contractId: 'market' },
    }).success
  ).toBe(false)
  expect(
    schema.safeParse({ content: { text: '' }, source: { postId: 'reply' } })
      .success
  ).toBe(true)
  expect(
    schema.safeParse({
      content: { text: 'My comment' },
      source: { postId: 'reply' },
    }).success
  ).toBe(true)
  expect(
    schema.safeParse({
      content: { text: 'x'.repeat(2001) },
      source: { postId: 'reply' },
    }).success
  ).toBe(false)
})
