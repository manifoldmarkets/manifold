import { createHmac, timingSafeEqual } from 'crypto'
import { getApiUrl } from 'common/api/utils'
import { DOMAIN } from 'common/envs/constants'
import { NotificationReason } from 'common/notification'
import { PrivateUser } from 'common/user'
import {
  getNotificationDestinationsForUser,
  notification_preference,
} from 'common/user-notification-preferences'

// One-click unsubscribe links carry an HMAC over the user id and the
// notification type, so a link can only change the preference it was sent
// for, for the user it was sent to. Links don't expire: they have to keep
// working in old emails. The version prefix allows rotating the key.
const SIGNATURE_VERSION = 'v1'

const signingKey = () => process.env.UNSUBSCRIBE_SIGNING_KEY

export const signUnsubscribe = (userId: string, type: string) => {
  const key = signingKey()
  if (!key) return undefined
  const mac = createHmac('sha256', key)
    .update(`${SIGNATURE_VERSION}:${userId}:${type}`)
    .digest('base64url')
  return `${SIGNATURE_VERSION}.${mac}`
}

export const verifyUnsubscribe = (
  userId: string,
  type: string,
  signature: unknown
) => {
  if (typeof signature !== 'string') return false
  const expected = signUnsubscribe(userId, type)
  if (!expected) return false
  const given = Buffer.from(signature)
  const wanted = Buffer.from(expected)
  return given.length === wanted.length && timingSafeEqual(given, wanted)
}

export const getNotificationSettingsUrl = (type?: string) =>
  `https://${DOMAIN}/notifications?tab=settings` +
  (type ? `&section=${encodeURIComponent(type)}` : '')

// Without a signing key there is no one-click link; the settings page (which
// requires signing in) is the fallback.
export const getUnsubscribeUrl = (
  userId: string,
  type: notification_preference
) => {
  const sig = signUnsubscribe(userId, type)
  if (!sig) return getNotificationSettingsUrl(type)
  const query = new URLSearchParams({ id: userId, type, sig })
  return `${getApiUrl('unsubscribe')}?${query}`
}

// getNotificationDestinationsForUser plus a signed unsubscribe link, for
// building emails.
export const getEmailNotificationDestinations = (
  privateUser: PrivateUser,
  reason: NotificationReason
) => {
  const destinations = getNotificationDestinationsForUser(privateUser, reason)
  const { notificationPreference } = destinations
  return {
    ...destinations,
    unsubscribeUrl: notificationPreference
      ? getUnsubscribeUrl(privateUser.id, notificationPreference)
      : '',
  }
}
