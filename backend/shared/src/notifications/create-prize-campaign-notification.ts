import {
  CharityGiveawayNotificationData,
  Notification,
  PrizeDrawingNotificationData,
} from 'common/notification'
import { convertPrivateUser } from 'common/supabase/users'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import {
  MANIFOLD_AVATAR_URL,
  MANIFOLD_USER_NAME,
  MANIFOLD_USER_USERNAME,
  PrivateUser,
} from 'common/user'
import { nanoid } from 'common/util/random'
import { createPushNotifications } from 'shared/create-push-notifications'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { bulkInsertNotifications } from 'shared/supabase/notifications'

const USER_BATCH_SIZE = 1000

type PrizeCampaignNotification =
  | {
      reason: 'prize_drawings'
      eventType: 'created' | 'ending_soon'
      sourceSlug: string
      title: string
      body: string
      data: PrizeDrawingNotificationData
    }
  | {
      reason: 'charity_giveaways'
      eventType: 'created' | 'ending_soon'
      sourceSlug: string
      title: string
      body: string
      data: CharityGiveawayNotificationData
    }

type PrivateUserBatchRow = {
  privateUser: PrivateUser
  cursorId: string
}

export async function createPrizeCampaignNotification(
  pg: SupabaseDirectClient,
  campaign: PrizeCampaignNotification
) {
  let lastSeenId: string | null = null

  while (true) {
    const privateUsers: PrivateUserBatchRow[] = await pg.map(
      `select pu.*, pu.id as cursor_id
       from private_users pu
       join users u on pu.id = u.id
       where ($1::text is null or pu.id > $1)
       order by pu.id
       limit $2`,
      [lastSeenId, USER_BATCH_SIZE],
      (r) =>
        ({
          privateUser: convertPrivateUser(r) as PrivateUser,
          cursorId: r.cursor_id as string,
        }) as PrivateUserBatchRow
    )

    if (privateUsers.length === 0) return

    const browserNotifications: Notification[] = []
    const pushNotifications: [PrivateUser, Notification, string, string][] = []

    for (const { privateUser } of privateUsers) {
      const { sendToBrowser, sendToMobile } = getNotificationDestinationsForUser(
        privateUser,
        campaign.reason
      )
      if (!sendToBrowser && !sendToMobile) continue

      const notification = buildNotification(privateUser.id, campaign)
      if (sendToBrowser) browserNotifications.push(notification)
      if (sendToMobile) {
        pushNotifications.push([
          privateUser,
          notification,
          campaign.title,
          campaign.body,
        ])
      }
    }

    if (pushNotifications.length > 0) {
      await createPushNotifications(pushNotifications)
    }
    if (browserNotifications.length > 0) {
      await bulkInsertNotifications(browserNotifications, pg, true)
    }

    lastSeenId = privateUsers[privateUsers.length - 1].cursorId
  }
}

function buildNotification(
  userId: string,
  campaign: PrizeCampaignNotification
): Notification {
  return {
    id: nanoid(6),
    userId,
    reason: campaign.reason,
    createdTime: Date.now(),
    isSeen: false,
    sourceId: getNotificationSourceId(campaign),
    sourceType: 'admin_message',
    sourceUpdateType: 'created',
    sourceUserName: MANIFOLD_USER_NAME,
    sourceUserUsername: MANIFOLD_USER_USERNAME,
    sourceUserAvatarUrl: MANIFOLD_AVATAR_URL,
    sourceText: campaign.body,
    sourceSlug: campaign.sourceSlug,
    sourceTitle: campaign.title,
    data: campaign.data,
  }
}

function getNotificationSourceId(campaign: PrizeCampaignNotification) {
  return campaign.reason === 'prize_drawings'
    ? campaign.data.sweepstakesNum.toString()
    : campaign.data.giveawayNum.toString()
}
