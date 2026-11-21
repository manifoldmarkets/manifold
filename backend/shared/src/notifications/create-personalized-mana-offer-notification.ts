import { Notification } from 'common/notification'
import { getPrivateUser } from 'shared/utils'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { createPushNotifications } from '../create-push-notifications'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { insertNotificationToSupabase } from 'shared/supabase/notifications'
import {
  MANIFOLD_AVATAR_URL,
  MANIFOLD_USER_NAME,
  MANIFOLD_USER_USERNAME,
} from 'common/user'
import { formatMoney } from 'common/util/format'

export type PersonalizedManaOfferContext = {
  // A short phrase describing WHY the user got this offer. Goes inside
  // "As a thank you for ${reasonPhrase}, ...". Keep lowercase, no
  // trailing punctuation. Examples:
  //   - "buying some merch recently"
  //   - "being a Plus subscriber for two months"
  //   - "logging in three days in a row"
  reasonPhrase: string
  // Mana amount the offer grants (e.g. 5000). Rendered via formatMoney.
  manaAmount: number
  // Maximum discount percentage to advertise — usually the better of the
  // crypto/card prices (e.g. 30 for "up to 30% off").
  maxDiscountPct: number
}

export const createPersonalizedManaOfferNotification = async (
  userId: string,
  offerId: string,
  context: PersonalizedManaOfferContext
) => {
  const privateUser = await getPrivateUser(userId)
  if (!privateUser) return

  const { sendToBrowser, sendToMobile } = getNotificationDestinationsForUser(
    privateUser,
    'personalized_mana_offer'
  )
  if (!sendToBrowser && !sendToMobile) return

  const sourceText =
    `As a thank you for ${context.reasonPhrase}, you have a ` +
    `time-limited offer for up to ${context.maxDiscountPct}% off your ` +
    `next purchase of ${formatMoney(context.manaAmount)}!`

  const notification: Notification = {
    id: `pmo-${offerId}`,
    userId,
    reason: 'personalized_mana_offer',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: offerId,
    sourceType: 'personalized_mana_offer',
    sourceUserName: MANIFOLD_USER_NAME,
    sourceUserUsername: MANIFOLD_USER_USERNAME,
    sourceUserAvatarUrl: MANIFOLD_AVATAR_URL,
    sourceText,
    sourceSlug: '/checkout?showOffer=1',
    data: {
      offerId,
      reasonPhrase: context.reasonPhrase,
      manaAmount: context.manaAmount,
      maxDiscountPct: context.maxDiscountPct,
      event: 'created',
    },
  }

  if (sendToBrowser) {
    const pg = createSupabaseDirectClient()
    await insertNotificationToSupabase(notification, pg)
  }
  if (sendToMobile) {
    try {
      await createPushNotifications([
        [
          privateUser,
          notification,
          'Personalised mana sale unlocked',
          sourceText,
        ],
      ])
    } catch (e: unknown) {
      // Don't let an Expo outage or bad push token crash the caller — e.g.
      // the backfill script iterates thousands of users and a single failed
      // push shouldn't abort the run. The in-app notification is still there.
      console.warn(
        `Push notification failed for personalized mana offer (user ${userId}):`,
        e
      )
    }
  }
}
