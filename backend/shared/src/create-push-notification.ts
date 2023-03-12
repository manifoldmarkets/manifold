import * as admin from 'firebase-admin'
import { partition } from 'lodash'
import { Expo, ExpoPushMessage, ExpoPushSuccessTicket } from 'expo-server-sdk'

import { Notification } from 'common/notification'
import { PrivateUser } from 'common/user'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { log } from 'shared/utils'
import { PushTicket } from 'common/push-ticket'

const firestore = admin.firestore()
type ExpoPushMessageWithNotification = ExpoPushMessage & {
  data: Notification
}

export const createPushNotification = async (
  notification: Notification,
  privateUser: PrivateUser,
  title: string,
  body: string
) => {
  const expo = new Expo()
  const { sendToMobile } = getNotificationDestinationsForUser(
    privateUser,
    notification.reason
  )
  if (!sendToMobile) return
  const somePushTokens = [privateUser.pushToken]
  // Create the messages that you want to send to clients
  const messages: ExpoPushMessageWithNotification[] = []
  for (const pushToken of somePushTokens) {
    // Check that all your push tokens appear to be valid Expo push tokens
    if (!Expo.isExpoPushToken(pushToken)) {
      log(`Push token ${pushToken} is not a valid Expo push token`)
      continue
    }

    // Construct a message (see https://docs.expo.io/push-notifications/sending-notifications/)
    messages.push({
      to: pushToken,
      channelId: 'default',
      sound: 'default',
      title,
      body,
      data: notification,
    })
  }
  const tickets = await expo.sendPushNotificationsAsync(messages)
  // write successful tickets to db
  const [successTickets, errorTickets] = partition(
    tickets,
    (ticket) => ticket.status === 'ok'
  )
  await Promise.all(
    (successTickets as ExpoPushSuccessTicket[]).map(async (ticket) =>
      firestore
        .collection(`users/${privateUser.id}/pushNotificationTickets`)
        .doc(ticket.id)
        .set({
          ...ticket,
          userId: privateUser.id,
          notificationId: notification.id,
          createdTime: Date.now(),
          receiptStatus: 'not-checked',
        } as PushTicket)
    )
  )
  await Promise.all(
    errorTickets.map(async (ticket) => {
      if (ticket.status === 'error') {
        log('Error generating push notification, ticket:', ticket)
        if (ticket.details?.error === 'DeviceNotRegistered') {
          // set private user pushToken to null
          await firestore
            .collection('private-users')
            .doc(privateUser.id)
            .update({
              pushToken: admin.firestore.FieldValue.delete(),
            })
        }
      }
    })
  )
}
