jest.mock('./utils', () => ({ getUser: jest.fn(), getPrivateUser: jest.fn() }))
jest.mock('./supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(() => ({})),
}))
jest.mock('./supabase/entitlements', () => ({
  getActiveSupporterEntitlements: jest.fn(),
}))
jest.mock('./supabase/notifications', () => ({
  insertNotificationToSupabase: jest.fn(),
}))
import { getPrivateUser, getUser } from './utils'
import { getActiveSupporterEntitlements } from './supabase/entitlements'
import { insertNotificationToSupabase } from './supabase/notifications'
import {
  assertSocialInteraction,
  getSocialViewer,
  limitSocialWrite,
  socialAuthor,
  SocialRow,
  validateSocialMarkets,
  validateSocialSource,
  notifySocial,
  hydrateSocialPosts,
} from './social-posts'
import { SupabaseDirectClient } from './supabase/init'
import { User } from 'common/user'
import { SUPPORTER_TIERS } from 'common/supporter-config'
import { FIREBASE_CONFIG } from 'common/envs/constants'

const post = {
  id: 'reply',
  user_id: 'parent-author',
  root_id: 'root',
  text: 'hello',
  deleted_time: null,
} as SocialRow
const db = (methods: Record<string, unknown>) =>
  methods as unknown as SupabaseDirectClient
beforeEach(() => jest.clearAllMocks())
test('hides untrusted, removed, and blocked post images', async () => {
  const image = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_CONFIG.storageBucket}/o/user-images%2Fauthor%2Fyap%2Fimage.png?alt=media&token=test-token`
  for (const state of ['visible', 'deleted', 'blocked'] as const) {
    const row = {
      ...post,
      id: 'root',
      root_id: 'root',
      parent_id: null,
      created_time: '2026-09-16 00:00:00+00',
      deleted_time: state === 'deleted' ? '2026-09-16 01:00:00+00' : null,
      image_urls: [image, 'https://tracker.example/pixel.png'],
    } as SocialRow
    const pg = db({
      manyOrNone: jest
        .fn()
        .mockResolvedValueOnce([
          { id: row.user_id, name: 'Author', username: 'author', data: {} },
        ])
        .mockResolvedValueOnce([row])
        .mockResolvedValue([]),
    })
    const [result] = await hydrateSocialPosts(
      pg,
      [row],
      {
        blocked: state === 'blocked' ? [row.user_id] : [],
      },
      false
    )
    expect(result.imageUrls).toEqual(state === 'visible' ? [image] : [])
    expect(result.removed).toBe(
      state === 'visible' ? null : state === 'blocked' ? 'blocked' : 'author'
    )
  }
})
test('membership comes from authoritative entitlements, and expiry does not block author access', async () => {
  jest.mocked(getUser).mockResolvedValue({
    id: 'u',
    entitlements: [{ enabled: true, entitlementId: SUPPORTER_TIERS.basic.id }],
  } as User)
  jest.mocked(getActiveSupporterEntitlements).mockResolvedValue([])
  await expect(socialAuthor('u', true)).rejects.toMatchObject({ code: 403 })
  await expect(socialAuthor('u')).resolves.toMatchObject({ id: 'u' })
  for (const tier of ['basic', 'plus', 'premium'] as const) {
    jest.mocked(getActiveSupporterEntitlements).mockResolvedValue([
      {
        enabled: true,
        entitlementId: SUPPORTER_TIERS[tier].id,
        grantedTime: 1,
        userId: 'u',
        autoRenew: false,
      },
    ])
    await expect(socialAuthor('u', true)).resolves.toMatchObject({ id: 'u' })
  }
})
test('blocks work in both directions and protect root authors from nested replies', async () => {
  jest.mocked(getPrivateUser).mockResolvedValue({
    blockedUserIds: ['a'],
    blockedByUserIds: ['b', 'a'],
  } as never)
  expect((await getSocialViewer('u')).blocked).toEqual(['a', 'b'])
  const pg = db({
    oneOrNone: jest
      .fn()
      .mockResolvedValue({ id: 'root', user_id: 'root-author' }),
  })
  for (const blocked of [['parent-author'], ['root-author']]) {
    await expect(
      assertSocialInteraction(pg, post, { id: 'u', blocked }, true)
    ).rejects.toMatchObject({ code: 403 })
  }
  await expect(
    assertSocialInteraction(pg, post, { id: 'u', blocked: [] }, true)
  ).resolves.toBeUndefined()
})
test('root deletion closes replies while a removed target rejects all new interactions', async () => {
  const pg = db({
    oneOrNone: jest.fn().mockResolvedValue({ id: 'root', deleted_time: 'now' }),
  })
  await expect(
    assertSocialInteraction(pg, post, { blocked: [] }, true)
  ).rejects.toMatchObject({ code: 403 })
  await expect(
    assertSocialInteraction(
      pg,
      { ...post, deleted_time: 'now' },
      { blocked: [] }
    )
  ).rejects.toMatchObject({ code: 403 })
})
test('unavailable markets and mismatched repost source are rejected', async () => {
  await expect(
    validateSocialMarkets(
      db({ manyOrNone: jest.fn().mockResolvedValue([{ id: 'a' }]) }),
      ['a', 'private']
    )
  ).rejects.toMatchObject({ code: 400 })
  await expect(
    validateSocialSource(db({}), { contractId: 'other' }, ['a'], {
      blocked: [],
    })
  ).rejects.toMatchObject({ code: 400 })
  await expect(
    validateSocialSource(
      db({ oneOrNone: jest.fn().mockResolvedValue(null) }),
      { contractId: 'a', commentId: 'hidden' },
      ['a'],
      { blocked: [] }
    )
  ).rejects.toMatchObject({ code: 400 })
})
test('database rate-limit exhaustion returns 429', async () => {
  await expect(
    limitSocialWrite(
      db({ oneOrNone: jest.fn().mockResolvedValue(null) }),
      'u',
      'post',
      10
    )
  ).rejects.toMatchObject({ code: 429 })
})
test('social notifications suppress self, blocks, and opt-outs and use reply content', async () => {
  const actor = { id: 'actor', name: 'Actor', username: 'actor' } as User
  await notifySocial(db({}), { ...post, user_id: 'actor' }, actor, 'like')
  expect(insertNotificationToSupabase).not.toHaveBeenCalled()
  jest.mocked(getPrivateUser).mockResolvedValue({
    blockedUserIds: ['actor'],
    blockedByUserIds: [],
  } as never)
  await notifySocial(db({}), post, actor, 'like')
  expect(insertNotificationToSupabase).not.toHaveBeenCalled()
  jest.mocked(getPrivateUser).mockResolvedValue({
    blockedUserIds: [],
    blockedByUserIds: [],
    notificationPreferences: { opt_out_all: [], social_replies: [] },
  } as never)
  await notifySocial(db({}), post, actor, 'reply', 'new-reply')
  expect(insertNotificationToSupabase).not.toHaveBeenCalled()
  jest.mocked(getPrivateUser).mockResolvedValue({
    blockedUserIds: [],
    blockedByUserIds: [],
    notificationPreferences: { opt_out_all: [], social_replies: ['browser'] },
  } as never)
  await notifySocial(
    db({
      oneOrNone: jest
        .fn()
        .mockResolvedValue({ ...post, id: 'new-reply', text: 'actual reply' }),
    }),
    post,
    actor,
    'reply',
    'new-reply'
  )
  expect(insertNotificationToSupabase).toHaveBeenCalledWith(
    expect.objectContaining({
      sourceText: 'actual reply',
      sourceSlug: '/yap/new-reply',
      sourceType: 'social_reply',
    }),
    expect.anything()
  )
})

test('Yap reposts reject missing, deleted, and blocked originals, including reply root blocks', async () => {
  const original = { ...post, root_id: 'root' }
  const root = { ...post, id: 'root', user_id: 'root-author' }
  const pg = (target: SocialRow | null) =>
    db({
      oneOrNone: jest.fn((_sql, [id]) =>
        Promise.resolve(id === 'reply' ? target : root)
      ),
    })
  await expect(
    validateSocialSource(pg(null), { postId: 'reply' }, [], { blocked: [] })
  ).rejects.toMatchObject({ code: 404 })
  await expect(
    validateSocialSource(
      pg({ ...original, deleted_time: 'now' }),
      { postId: 'reply' },
      [],
      { blocked: [] }
    )
  ).rejects.toMatchObject({ code: 403 })
  for (const blocked of [['parent-author'], ['root-author']]) {
    await expect(
      validateSocialSource(pg(original), { postId: 'reply' }, [], { blocked })
    ).rejects.toMatchObject({ code: 403 })
  }
  await expect(
    validateSocialSource(pg(original), { postId: 'reply' }, [], { blocked: [] })
  ).resolves.toBeUndefined()
})
