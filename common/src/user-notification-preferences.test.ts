import {
  getDefaultNotificationPreferences,
  getNotificationDestinationsForUser,
  getNotificationPreference,
  getSavedNotificationDestinations,
} from './user-notification-preferences'
import { PrivateUser } from './user'

describe('tagged_all_traders preferences', () => {
  it('inherits an existing direct-tag preference for legacy users', () => {
    expect(
      getSavedNotificationDestinations(
        { tagged_user: ['browser', 'email', 'mobile'] },
        'tagged_all_traders'
      )
    ).toEqual(['browser', 'email', 'mobile'])
  })

  it('keeps an explicitly disabled preference independent of direct tags', () => {
    expect(
      getSavedNotificationDestinations(
        { tagged_user: ['browser', 'email', 'mobile'], tagged_all_traders: [] },
        'tagged_all_traders'
      )
    ).toEqual([])
  })

  it('defaults to in-app delivery when neither preference is saved', () => {
    expect(getSavedNotificationDestinations({}, 'tagged_all_traders')).toEqual([
      'browser',
    ])
  })

  it('resolves a stored traders notification to its own preference', () => {
    expect(getNotificationPreference('tagged_all_traders')).toBe(
      'tagged_all_traders'
    )
    const user: PrivateUser = {
      id: 'trader',
      pushToken: 'ExponentPushToken[test]',
      blockedUserIds: [],
      blockedByUserIds: [],
      blockedContractIds: [],
      blockedGroupSlugs: [],
      notificationPreferences: {
        ...getDefaultNotificationPreferences(),
        tagged_user: [],
        tagged_all_traders: ['browser', 'email', 'mobile'],
      },
    }
    expect(
      getNotificationDestinationsForUser(user, 'tagged_all_traders')
    ).toMatchObject({
      sendToBrowser: true,
      sendToEmail: true,
      sendToMobile: true,
      notificationPreference: 'tagged_all_traders',
      unsubscribeUrl: expect.stringContaining('type=tagged_all_traders'),
    })
  })
})
