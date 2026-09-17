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
import { SocialPost, SocialPostPage } from 'common/social-post'
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

test('shared feed cache isolates viewer likes, expires, and bypasses blocks and refreshes', async () => {
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
    const read = (uid: string, useCache = 'true') =>
      getSocialPosts(
        API['get-social-posts'].props.parse({ limit: 30, useCache }),
        { uid } as AuthedUser,
        {} as Request
      ) as Promise<SocialPostPage>

    const [alice, bob] = await Promise.all([read('alice'), read('bob')])
    expect(hydrate).toHaveBeenCalledTimes(1)
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
  const manyOrNone = jest.fn().mockResolvedValue([
    {
      id: 'visible',
      name: 'Visible',
      username: 'visible',
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
    users: [{ id: 'visible', name: 'Visible', username: 'visible' }],
    nextCursor: '2026-09-16T00:00:00.123456+00:00|visible',
  })
  expect(getSocialViewer).toHaveBeenLastCalledWith('viewer')
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
