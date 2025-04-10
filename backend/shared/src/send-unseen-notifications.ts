import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { createPushNotifications } from 'shared/create-push-notifications'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { PrivateUser } from 'common/user'
import { MarketMovementData, Notification } from 'common/notification'
import {
  getMarketMovementEmail,
  MarketMovementEmailData,
  sendBulkEmails,
} from 'shared/emails'

const MOVEMENTS_TO_SEND = 6
// TODO: if we want to send these/check more often, we need to save rows
//  to the market_movement_notifications table with 'mobile' destination
export async function sendUnseenMarketMovementNotifications() {
  const pg = createSupabaseDirectClient()

  const results = await pg.manyOrNone(`
    with latest_contract_notifications as (
        select distinct on (cmn.contract_id, n.user_id)
          cmn.notification_id,
          cmn.contract_id,
          n.user_id
        from contract_movement_notifications cmn
          join user_notifications n on n.notification_id = cmn.notification_id
        where cmn.destination = 'browser'
          and cmn.created_time > now() - interval '24 hours'
          and n.data->>'isSeen' = 'false'
        order by cmn.contract_id, n.user_id, cmn.created_time desc
    ),
    user_unseen_notifications as (
        select
          n.data as notification,
          pu.data as private_user,
          u.id as user_id,
          u.name as user_name,
          row_number() over (partition by n.user_id order by c.importance_score desc) as importance_rank
        from latest_contract_notifications lcn
          join user_notifications n on n.notification_id = lcn.notification_id
          join private_users pu on n.user_id = pu.id
          join users u on pu.id = u.id
          join contracts c on lcn.contract_id = c.id
        where c.resolution is null
    )
    select * from user_unseen_notifications
    where importance_rank <= ${MOVEMENTS_TO_SEND}
    order by user_id, importance_rank
  `)

  if (results.length === 0) {
    log('No unseen market movement notifications to process')
    return
  }

  log(`Found ${results.length} unseen market movement notifications`)

  // Group notifications by user
  const userNotifications = new Map<string, typeof results>()
  for (const result of results) {
    const userId = result.private_user.id
    if (!userNotifications.has(userId)) {
      userNotifications.set(userId, [])
    }
    userNotifications.get(userId)?.push(result)
  }

  log(
    `Found ${userNotifications.size} users with unseen market movement notifications`
  )

  // Prepare notifications for sending
  const notificationsToSend: [PrivateUser, Notification, string, string][] = []
  const bulkEmails = []

  for (const [userId, userResults] of userNotifications) {
    const privateUser = userResults[0].private_user as PrivateUser
    const userName = userResults[0].user_name as string

    // Get top notification for push notification
    const topResult = userResults[0]
    const topNotification = topResult.notification as Notification

    const { sendToMobile, sendToEmail } = getNotificationDestinationsForUser(
      privateUser,
      'market_movements'
    )

    if (sendToMobile) {
      const { sourceContractTitle: question } = topNotification
      const data = topNotification.data as MarketMovementData
      const startProb = data.val_start
      const endProb = data.val_end
      const answerText = data.answerText

      const startProbText = `${Math.round(startProb * 100)}%`
      const endProbText = `${Math.round(endProb * 100)}%`

      // Basic title/body for the notification
      const questionText = truncateText(question, answerText ? 70 : 130)
      const answer = answerText ? `:\n${truncateText(answerText, 60)}` : ''
      const title = 'Market movement'
      const body = `${questionText}${answer}: ${startProbText} → ${endProbText}`

      notificationsToSend.push([privateUser, topNotification, title, body])
    }

    // Prepare email notification (using up to 5 notifications)
    if (sendToEmail) {
      const marketMovements: MarketMovementEmailData[] = userResults.map(
        (result) => {
          const notification = result.notification as Notification
          const {
            sourceContractTitle: question,
            sourceContractCreatorUsername: creatorUsername,
            sourceContractSlug: slug,
          } = notification
          const data = notification.data as MarketMovementData
          const greenBg =
            'background-color: rgba(0,160,0,0.2); color: rgba(0,160,0,1);'
          const redBg = 'background-color: rgba(160,0,0,0.2); color: #a80000;'
          const startProb = data.val_start
          const endProb = data.val_end
          const answerText = data.answerText

          return {
            questionTitle: question!,
            questionUrl: `https://manifold.markets/${creatorUsername}/${slug}`,
            prob: `${Math.round(endProb * 100)}%`,
            probChangeStyle: endProb > startProb ? greenBg : redBg,
            startProb,
            endProb,
            answerText,
          }
        }
      )

      const emailEntry = getMarketMovementEmail(
        userName,
        privateUser,
        marketMovements,
        MOVEMENTS_TO_SEND
      )
      if (emailEntry) {
        bulkEmails.push(emailEntry)
      }
    }
  }

  // Send push notifications
  if (notificationsToSend.length > 0) {
    log(`Sending ${notificationsToSend.length} push notifications`)
    await createPushNotifications(notificationsToSend)
  }

  // Send emails
  if (bulkEmails.length > 0) {
    log(`Sending ${bulkEmails.length} market movement emails`)
    await sendBulkEmails(
      'Your markets are moving 🏃💨',
      'market-movements-bulk',
      bulkEmails
    )
  }
}

export function truncateText(text: string | undefined, slice: number) {
  if (!text) {
    return text
  }
  if (text.length <= slice + 3) {
    return text
  }
  return text.slice(0, slice) + '...'
}
