import { getPrivateUser } from 'shared/utils'
import { Expo } from 'expo-server-sdk'
import { Contract } from 'common/contract'
import { PrivateUser, User } from 'common/user'
import {
  getDefaultNotificationPreferences,
  getNotificationPreference,
  notification_destination_types,
} from 'common/user-notification-preferences'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { bulkInsertNotifications } from 'shared/supabase/notifications'
import {
  getUniqueBettorIds,
  getUniqueVoterIds,
} from 'shared/supabase/contracts'
import { getNewCommentEmail } from '../emails'
import { createCommentOnContractNotification } from './create-new-contract-comment-notif'

jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
}))
jest.mock('shared/utils', () => ({
  isProd: () => false,
  getPrivateUser: jest.fn(),
  log: Object.assign(jest.fn(), { error: jest.fn() }),
}))
jest.mock('shared/supabase/contracts', () => ({
  getUniqueBettorIds: jest.fn(),
  getUniqueVoterIds: jest.fn(),
}))
jest.mock('shared/supabase/notifications', () => ({
  bulkInsertNotifications: jest.fn(),
}))
jest.mock('../supabase/users', () => ({ updatePrivateUser: jest.fn() }))
jest.mock('../supabase/utils', () => ({
  bulkInsert: jest.fn(),
  FieldVal: { delete: jest.fn() },
}))
jest.mock('../emails', () => ({
  sendBulkEmails: jest.fn(),
  getNewCommentEmail: jest.fn(),
}))
jest.mock('expo-server-sdk', () => ({
  Expo: Object.assign(
    jest.fn().mockImplementation(() => ({
      chunkPushNotifications: (messages: unknown[]) => [messages],
      sendPushNotificationsAsync: jest.fn().mockResolvedValue([]),
    })),
    {
      isExpoPushToken: (token: unknown): token is string =>
        typeof token === 'string',
    }
  ),
}))

const map = jest.fn()
const manyOrNone = jest.fn()
const storeGrouped = jest.fn()
jest.mock('shared/websockets/server', () => ({ broadcast: jest.fn() }))
const sourceUser = {
  id: 'creator',
  name: 'Creator',
  username: 'creator',
} as User
const contract = {
  id: 'market',
  creatorId: 'creator',
  creatorUsername: 'creator',
  question: 'Question?',
  slug: 'question',
} as Contract
const tradersTag = 'eMG8r3PEdRgtGArGGx1VUBGDwY53'

beforeEach(() => {
  jest.clearAllMocks()
  manyOrNone.mockResolvedValue([])
  jest.mocked(createSupabaseDirectClient).mockReturnValue({
    map,
    manyOrNone,
    none: storeGrouped,
    oneOrNone: async () => ({
      id: 'root',
      root_id: 'root',
      user_id: 'root-author',
      text: 'reply',
    }),
  } as unknown as ReturnType<typeof createSupabaseDirectClient>)
  jest.mocked(getUniqueBettorIds).mockResolvedValue(['trader'])
  jest.mocked(getUniqueVoterIds).mockResolvedValue([])
})

const notify = async (
  direct: notification_destination_types[],
  traders: notification_destination_types[],
  taggedUsers = [tradersTag]
) => {
  const recipient: PrivateUser & { name: string } = {
    id: 'trader',
    name: 'Trader',
    email: 'trader@example.com',
    pushToken: 'ExponentPushToken[test]',
    blockedUserIds: [],
    blockedByUserIds: [],
    blockedContractIds: [],
    blockedGroupSlugs: [],
    notificationPreferences: {
      ...getDefaultNotificationPreferences(),
      tagged_user: direct,
      tagged_all_traders: traders,
    },
  }
  // This trader does not follow the market; tagging still reaches them.
  map.mockResolvedValueOnce([]).mockResolvedValueOnce([recipient])
  await createCommentOnContractNotification(
    'comment',
    sourceUser,
    '@traders',
    contract,
    {},
    taggedUsers,
    false
  )
  const expo = jest.mocked(Expo).mock.results[0].value as {
    sendPushNotificationsAsync: jest.Mock
  }
  return expo.sendPushNotificationsAsync.mock.calls[0][0] as {
    data: { reason: string }
  }[]
}

it('delivers traders push independently of disabled direct tags', async () => {
  const messages = await notify([], ['browser', 'mobile'])
  expect(messages).toHaveLength(1)
  expect(messages[0].data.reason).toBe('tagged_all_traders')
  const notifications = jest.mocked(bulkInsertNotifications).mock.calls[0][0]
  expect(notifications).toHaveLength(1)
  expect(getNotificationPreference(notifications[0].reason)).toBe(
    'tagged_all_traders'
  )
})

it('does not send traders push when only direct-tag push is enabled', async () => {
  expect(await notify(['mobile'], ['browser'])).toEqual([])
})

it('keeps explicit user tags on the direct-tag preference', async () => {
  const messages = await notify(['mobile'], ['browser'], [tradersTag, 'trader'])
  expect(messages).toHaveLength(1)
  expect(messages[0].data.reason).toBe('tagged_user')
  expect(jest.mocked(bulkInsertNotifications).mock.calls[0][0]).toEqual([])
})

it('uses the traders preference for email unsubscribe links', async () => {
  await notify([], ['email'])
  expect(getNewCommentEmail).toHaveBeenCalledWith(
    'tagged_all_traders',
    expect.anything(),
    'Trader',
    sourceUser,
    contract,
    '@traders',
    'comment',
    undefined
  )
})

// Someone who follows the market with comment alerts on. Following the Yap
// thread moves the in-app alert to Yap's grouped one; muting that thread turns
// the Yap alert off and leaves the market's alert as it was.
it.each([
  ['ordinary', undefined, 1, 0],
  ['following', { user_id: 'trader', muted: false }, 0, 1],
  ['muted', { user_id: 'trader', muted: true }, 1, 0],
])(
  'a market follower is told once, by the market unless Yap tells them: %s',
  async (_case, subscription, expected, grouped) => {
    manyOrNone.mockResolvedValue(
      subscription
        ? [{ ...subscription, parent_id: 'parent', reply_id: 'reply' }]
        : []
    )
    const recipient = {
      id: 'trader',
      name: 'Trader',
      blockedUserIds: [],
      blockedByUserIds: [],
      blockedContractIds: [],
      blockedGroupSlugs: [],
      notificationPreferences: {
        ...getDefaultNotificationPreferences(),
        all_comments_on_watched_markets: ['browser'],
        social_replies: ['browser'],
      },
    } as unknown as PrivateUser
    jest.mocked(getPrivateUser).mockResolvedValue(recipient)
    map.mockResolvedValueOnce(['trader']).mockResolvedValueOnce([recipient])
    await createCommentOnContractNotification(
      'comment',
      sourceUser,
      'hello',
      contract,
      {},
      [],
      false
    )
    expect(jest.mocked(bulkInsertNotifications).mock.calls[0][0]).toHaveLength(
      expected as number
    )
    expect(storeGrouped).toHaveBeenCalledTimes(grouped as number)
  }
)

it('a muted Yap thread still allows an explicit mention', async () => {
  manyOrNone.mockResolvedValue([{ user_id: 'trader', muted: true }])
  await notify(['browser'], [], ['trader'])
  expect(jest.mocked(bulkInsertNotifications).mock.calls[0][0]).toEqual([
    expect.objectContaining({ reason: 'tagged_user' }),
  ])
})

// A reply to someone's comment, with the default preferences for replies
// (in-app, push and email). Following the comment's Yap thread groups the
// in-app alert there and nothing else. Muting that thread is a Yap setting:
// the market still sends the reply on every channel, as if they were not on Yap.
it.each([
  ['is not on Yap', undefined, false, { inApp: 1, push: 1, email: 1 }],
  ['follows the Yap thread', false, false, { inApp: 0, push: 1, email: 1 }],
  [
    'follows it with in-app Yap alerts turned off',
    false,
    true,
    { inApp: 1, push: 1, email: 1 },
  ],
  ['muted the Yap thread', true, false, { inApp: 1, push: 1, email: 1 }],
])(
  'a reply reaches someone who %s on the right channels',
  async (_case, muted, yapAlertsOff, expected) => {
    manyOrNone.mockResolvedValue(
      muted === undefined
        ? []
        : [{ user_id: 'trader', muted, parent_id: 'parent', reply_id: 'reply' }]
    )
    const recipient = {
      id: 'trader',
      name: 'Trader',
      email: 'trader@example.com',
      pushToken: 'ExponentPushToken[test]',
      blockedUserIds: [],
      blockedByUserIds: [],
      blockedContractIds: [],
      blockedGroupSlugs: [],
      notificationPreferences: {
        ...getDefaultNotificationPreferences(),
        ...(yapAlertsOff ? { social_replies: [] } : {}),
      },
    } as unknown as PrivateUser
    jest.mocked(getPrivateUser).mockResolvedValue(recipient)
    map.mockResolvedValueOnce(['trader']).mockResolvedValueOnce([recipient])
    await createCommentOnContractNotification(
      'comment',
      sourceUser,
      'hello',
      contract,
      {
        trader: {
          repliedToType: 'comment',
          repliedToAnswerText: undefined,
          repliedToAnswerId: undefined,
          bet: undefined,
        },
      },
      [],
      false
    )
    expect(storeGrouped).toHaveBeenCalledTimes(
      muted === false && !yapAlertsOff ? 1 : 0
    )
    expect(jest.mocked(bulkInsertNotifications).mock.calls[0][0]).toHaveLength(
      expected.inApp
    )
    const expo = jest.mocked(Expo).mock.results[0].value as {
      sendPushNotificationsAsync: jest.Mock
    }
    expect(expo.sendPushNotificationsAsync.mock.calls[0][0]).toHaveLength(
      expected.push
    )
    expect(getNewCommentEmail).toHaveBeenCalledTimes(expected.email)
  }
)

it.each(['blocked root', 'failed grouped write', 'creator', 'direct tag'])(
  'preserves the native alert for %s',
  async (scenario) => {
    manyOrNone.mockResolvedValue([
      { user_id: 'reader', muted: false, parent_id: 'root', reply_id: 'reply' },
    ])
    const recipient = {
      id: 'reader',
      blockedUserIds: scenario === 'blocked root' ? ['root-author'] : [],
      blockedByUserIds: [],
      blockedContractIds: [],
      blockedGroupSlugs: [],
      notificationPreferences: {
        ...getDefaultNotificationPreferences(),
        all_comments_on_watched_markets: ['browser'],
      },
    } as unknown as PrivateUser
    jest.mocked(getPrivateUser).mockResolvedValue(recipient)
    map.mockResolvedValueOnce(['reader']).mockResolvedValueOnce([recipient])
    if (scenario === 'failed grouped write')
      storeGrouped.mockRejectedValueOnce(new Error('local fixture'))
    await createCommentOnContractNotification(
      'comment',
      sourceUser,
      'hello',
      {
        ...contract,
        creatorId: scenario === 'creator' ? 'reader' : contract.creatorId,
      },
      {},
      scenario === 'direct tag' ? ['reader'] : [],
      scenario === 'creator'
    )
    const alerts = jest.mocked(bulkInsertNotifications).mock.calls[0][0]
    expect(alerts).toHaveLength(1)
    expect(alerts[0].userId).toBe('reader')
    if (scenario === 'creator') expect(alerts[0].markedAsRead).toBe(false)
    if (scenario === 'direct tag') expect(alerts[0].reason).toBe('tagged_user')
    expect(storeGrouped).toHaveBeenCalledTimes(
      scenario === 'failed grouped write' ? 1 : 0
    )
  }
)
