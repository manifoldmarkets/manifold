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
  jest.mocked(createSupabaseDirectClient).mockReturnValue({
    map,
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
