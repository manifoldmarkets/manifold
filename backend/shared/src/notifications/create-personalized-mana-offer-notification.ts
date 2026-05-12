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

export const createPersonalizedManaOfferNotification = async (
  userId: string,

  offerId: string,

  itemName?: string
) => {
  const privateUser = await getPrivateUser(userId)

  if (!privateUser) return

  const { sendToBrowser, sendToMobile } = getNotificationDestinationsForUser(
    privateUser,

    'personalized_mana_offer'
  )

  if (!sendToBrowser && !sendToMobile) return

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

    sourceText: 'You have a personalised mana sale available!',

    sourceSlug: '/checkout',

    data: { offerId, itemName, event: 'created' },
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

          'Thanks for your merch order — tap to claim a discounted mana bundle.',
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
