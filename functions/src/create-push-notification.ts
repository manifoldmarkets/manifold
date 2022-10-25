import { Expo, ExpoPushMessage, ExpoPushSuccessTicket } from 'expo-server-sdk'
import { Notification } from 'common/notification'
import { PrivateUser } from 'common/user'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { log } from './utils'
import * as admin from 'firebase-admin'
import { partition } from 'lodash'
import { PushTicket } from 'common/push-ticket'
import { removeUndefinedProps } from 'common/util/object'
const firestore = admin.firestore()
type ExpoPushMessageWithNotification = ExpoPushMessage & {
  data: { notification: Notification }
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
      data: { notification: notification },
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

// TODO: run regularly to check for receipts
export const checkPushNotificationReceipts = async () => {
  const expo = new Expo()
  // Later, after the Expo push notification service has delivered the
  // notifications to Apple or Google (usually quickly, but allow the service
  // up to 30 minutes when under load), a "receipt" for each notification is
  // created. The receipts will be available for at least a day; stale receipts
  // are deleted.
  //
  // The ID of each receipt is sent back in the response "ticket" for each
  // notification. In summary, sending a notification produces a ticket, which
  // contains a receipt ID you later use to get the receipt.
  //
  // The receipts may contain error codes to which you must respond. In
  // particular, Apple or Google may block apps that continue to send
  // notifications to devices that have blocked notifications or have uninstalled
  // your app. Expo does not control this policy and sends back the feedback from
  // Apple and Google so you can handle it appropriately.
  const tickets = (
    await firestore
      .collectionGroup('pushNotificationTickets')
      .where('receiptStatus', '==', 'not-checked')
      // .where('createdTime', '>', Date.now() - MINUTE_MS * 30)
      .get()
  ).docs.map((doc) => doc.data() as PushTicket)

  const receiptIds = tickets.map((ticket) => ticket.id)

  const receiptIdChunks = expo.chunkPushNotificationReceiptIds(receiptIds)
  // Like sending notifications, there are different strategies you could use
  // to retrieve batches of receipts from the Expo service.
  for (const chunk of receiptIdChunks) {
    try {
      const receipts = await expo.getPushNotificationReceiptsAsync(chunk)
      log(receipts)
      await Promise.all(
        Object.entries(receipts).map(async ([receiptId, receipt]) => {
          const ticket = tickets.find((ticket) => ticket.id === receiptId)
          if (!ticket) {
            log(`Could not find ticket for receiptId ${receiptId}`)
            return
          }
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          const { status, message, details } = receipts[receiptId]
          let error: string | undefined
          if (status === 'error') {
            log(`There was an error sending a notification: ${message}`)
            if (details && details.error) {
              error = details.error
              // The error codes are listed in the Expo documentation:
              // https://docs.expo.io/push-notifications/sending-notifications/#individual-errors
              log(`The error code is ${error}`)
              if (error === 'DeviceNotRegistered') {
                // set private user pushToken to null
                await firestore
                  .collection('private-users')
                  .doc(ticket.userId)
                  .update({
                    pushToken: admin.firestore.FieldValue.delete(),
                  })
              }
            }
          }
          await firestore
            .collection(`users/${ticket.userId}/pushNotificationTickets`)
            .doc(ticket.id)
            .update(
              removeUndefinedProps({
                receiptStatus: receipt.status,
                receiptError: error,
              })
            )
        })
      )
    } catch (error) {
      log(error)
    }
  }
}
