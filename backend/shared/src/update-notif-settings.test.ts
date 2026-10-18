import { updateNotifSettings } from 'api/update-notif-settings'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updatePrivateUser } from 'shared/supabase/users'
import { broadcastUpdatedPrivateUser } from 'shared/websockets/helpers'
import {
  notification_preference,
  notification_preferences,
} from 'common/user-notification-preferences'

jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
}))
jest.mock('shared/supabase/users', () => ({ updatePrivateUser: jest.fn() }))
jest.mock('shared/websockets/helpers', () => ({
  broadcastUpdatedPrivateUser: jest.fn(),
}))

const transaction = {
  one: jest.fn(),
  none: jest.fn().mockResolvedValue(null),
}
const tx = jest.fn((callback: (db: typeof transaction) => Promise<void>) =>
  callback(transaction)
)
const auth = { uid: 'trader' } as Parameters<typeof updateNotifSettings>[1]
const request = {} as Parameters<typeof updateNotifSettings>[2]

beforeEach(() => {
  jest.clearAllMocks()
  transaction.one.mockResolvedValue({ notificationPreferences: {} })
  jest.mocked(createSupabaseDirectClient).mockReturnValue({
    tx,
  } as unknown as ReturnType<typeof createSupabaseDirectClient>)
})

it('turns off inherited mobile delivery without disabling web or email', async () => {
  const preferences: Partial<notification_preferences> = {
    tagged_user: ['browser', 'email', 'mobile'],
  }
  transaction.one.mockResolvedValue({ notificationPreferences: preferences })
  await updateNotifSettings(
    { type: 'tagged_all_traders', medium: 'mobile', enabled: false },
    auth,
    request
  )
  expect(transaction.one).toHaveBeenCalledWith(
    expect.stringMatching(/for update/i),
    ['trader']
  )
  expect(transaction.none).toHaveBeenCalledWith(expect.any(String), [
    'tagged_all_traders',
    '["browser","email"]',
    'trader',
  ])
  expect(preferences).toEqual({ tagged_user: ['browser', 'email', 'mobile'] })
  expect(broadcastUpdatedPrivateUser).toHaveBeenCalledWith('trader')
})

it('preserves explicitly disabled traders channels when enabling email', async () => {
  transaction.one.mockResolvedValue({
    notificationPreferences: {
      tagged_user: ['browser', 'email', 'mobile'],
      tagged_all_traders: [],
    },
  })
  await updateNotifSettings(
    { type: 'tagged_all_traders', medium: 'email', enabled: true },
    auth,
    request
  )
  expect(transaction.none).toHaveBeenCalledWith(expect.any(String), [
    'tagged_all_traders',
    '["email"]',
    'trader',
  ])
})

it.each<[notification_preference, string]>([
  ['tagged_user', '["browser","email","mobile"]'],
  ['opt_out_all', '["browser"]'],
])(
  'uses default destinations when %s has no saved value',
  async (type, defaults) => {
    await updateNotifSettings(
      { type, medium: 'browser', enabled: true },
      auth,
      request
    )
    expect(transaction.none).toHaveBeenCalledWith(expect.any(String), [
      type,
      defaults,
      'trader',
    ])
  }
)

it('preserves the mobile opt-out flag update', async () => {
  await updateNotifSettings(
    { type: 'opt_out_all', medium: 'mobile', enabled: true },
    auth,
    request
  )
  expect(updatePrivateUser).toHaveBeenCalledWith(expect.anything(), 'trader', {
    interestedInPushNotifications: false,
  })
})
