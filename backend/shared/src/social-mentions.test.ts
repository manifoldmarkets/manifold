jest.mock('./utils', () => ({ getPrivateUser: jest.fn() }))
jest.mock('./supabase/notifications', () => ({
  insertNotificationToSupabase: jest.fn(),
}))

import { getSourceUrl, Notification } from 'common/notification'
import { PrivateUser, User } from 'common/user'
import { notifySocialMentions } from './social-mentions'
import type { SocialRow } from './social-posts'
import type { SupabaseDirectClient } from './supabase/init'
import { insertNotificationToSupabase } from './supabase/notifications'
import { getPrivateUser } from './utils'

const actor = { id: 'actor', name: 'Actor', username: 'actor' } as User
const postWithTags = (...ids: string[]): SocialRow => ({
  id: 'post',
  user_id: actor.id,
  parent_id: null,
  root_id: 'post',
  text: 'Hello readers',
  image_urls: [],
  created_time: '2026-09-21 12:00:00+00',
  edited_time: null,
  source_post_id: null,
  source_contract_id: null,
  source_comment_id: null,
  source_bet_id: null,
  deleted_time: null,
  deleted_by: null,
  removed_by_moderator: false,
  rich_content: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: ids.map((id) => ({
          type: 'mention',
          attrs: { id, label: id },
        })),
      },
    ],
  },
})
const privateUser = (overrides: Partial<PrivateUser> = {}) =>
  ({
    id: 'reader',
    blockedUserIds: [],
    blockedByUserIds: [],
    notificationPreferences: { opt_out_all: [], tagged_user: ['browser'] },
    ...overrides,
  } as PrivateUser)
const db = (post: SocialRow | null, rootUserId = actor.id) => {
  const oneOrNone = jest
    .fn()
    .mockResolvedValue(post && { ...post, root_user_id: rootUserId })
  return { oneOrNone } as unknown as SupabaseDirectClient
}
const notifications = () =>
  jest.mocked(insertNotificationToSupabase).mock.calls.map(([n]) => n)

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getPrivateUser).mockResolvedValue(privateUser())
})

test('deduplicates tags, suppresses self, and links to the post with the actor identity', async () => {
  const post = postWithTags('reader', 'reader', actor.id)
  await notifySocialMentions(db(post), post, actor)
  expect(getPrivateUser).toHaveBeenCalledTimes(1)
  expect(notifications()).toHaveLength(1)
  const notification = notifications()[0]
  expect(notification).toMatchObject({
    id: 'social-mention-post',
    userId: 'reader',
    reason: 'tagged_user',
    sourceType: 'social_mention',
    sourceId: 'post',
    sourceText: 'Hello readers',
    sourceTitle: 'Yap',
    data: { sourceUserId: actor.id },
  })
  expect(getSourceUrl(notification)).toBe('/yap/post')
})

test('does not notify for plain text, bots, deleted posts, or a post deleted before its continuation', async () => {
  const post = postWithTags('reader')
  await notifySocialMentions(db(post), { ...post, rich_content: null }, actor)
  await notifySocialMentions(db(post), post, { ...actor, isBot: true })
  await notifySocialMentions(db(post), { ...post, deleted_time: 'now' }, actor)
  await notifySocialMentions(db(null), post, actor)
  expect(getPrivateUser).not.toHaveBeenCalled()
  expect(notifications()).toEqual([])
})

test.each([
  { blockedUserIds: ['actor'] },
  { blockedByUserIds: ['actor'] },
  { blockedUserIds: ['root-author'] },
  { blockedByUserIds: ['root-author'] },
])(
  'suppresses notifications when the reader cannot view the author or root: %j',
  async (blocks) => {
    const post = {
      ...postWithTags('reader'),
      parent_id: 'parent',
      root_id: 'root',
    }
    jest.mocked(getPrivateUser).mockResolvedValue(privateUser(blocks))
    await notifySocialMentions(db(post, 'root-author'), post, actor)
    expect(notifications()).toEqual([])
  }
)

test.each([
  { opt_out_all: [], tagged_user: [] },
  { opt_out_all: ['browser'], tagged_user: ['browser'] },
  { opt_out_all: [], tagged_user: ['email', 'mobile'] },
])('honors browser mention preferences: %j', async (preferences) => {
  const post = postWithTags('reader')
  jest
    .mocked(getPrivateUser)
    .mockResolvedValue(
      privateUser({ notificationPreferences: preferences as never })
    )
  await notifySocialMentions(db(post), post, actor)
  expect(notifications()).toEqual([])
})

test('skips the parent only when their reply notification is enabled', async () => {
  const post = {
    ...postWithTags('reader'),
    parent_id: 'parent',
    root_id: 'root',
  }
  for (const enabled of [true, false]) {
    jest.mocked(getPrivateUser).mockResolvedValue(
      privateUser({
        notificationPreferences: {
          opt_out_all: [],
          tagged_user: ['browser'],
          social_replies: enabled ? ['browser'] : [],
        } as never,
      })
    )
    await notifySocialMentions(db(post, 'reader'), post, actor, 'reader')
    expect(notifications()).toHaveLength(enabled ? 0 : 1)
  }
})

test('uses current tags and text when the post changes before notification', async () => {
  const original = postWithTags('removed-reader', 'reader')
  const current = { ...postWithTags('reader'), text: 'Updated text' }
  await notifySocialMentions(db(current), original, actor)
  expect(getPrivateUser).toHaveBeenCalledWith('reader', expect.anything())
  expect(getPrivateUser).not.toHaveBeenCalledWith(
    'removed-reader',
    expect.anything()
  )
  expect(notifications()[0].sourceText).toBe('Updated text')
})

test('bounds recipient fanout and shares an indexed notification ID across recipients', async () => {
  const post = postWithTags(
    ...Array.from({ length: 12 }, (_, i) => `reader-${i}`)
  )
  await notifySocialMentions(db(post), post, actor)
  expect(notifications()).toHaveLength(10)
  expect(new Set(notifications().map((n) => n.id))).toEqual(
    new Set(['social-mention-post'])
  )
  expect(new Set(notifications().map((n) => n.userId)).size).toBe(10)
})

test('omits missing recipients and truncates snippets without splitting Unicode', async () => {
  const post = { ...postWithTags('missing', 'reader'), text: '😀'.repeat(201) }
  jest
    .mocked(getPrivateUser)
    .mockImplementation(async (id) => (id === 'missing' ? null : privateUser()))
  await notifySocialMentions(db(post), post, actor)
  const [notification]: Notification[] = notifications()
  expect(notifications()).toHaveLength(1)
  expect(notification.sourceText).toBe('😀'.repeat(200))
})
