import {
  Expo,
  ExpoPushMessage,
  ExpoPushSuccessTicket,
  ExpoPushTicket,
} from 'expo-server-sdk'
import { Notification } from 'common/notification'
import { PrivateUser } from 'common/user'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { log } from './utils'
import * as admin from 'firebase-admin'
import { partition } from 'lodash'
import { PushTicket } from 'common/push-ticket'
const firestore = admin.firestore()

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
  const messages = [] as ExpoPushMessage[]
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

  // The Expo push notification service accepts batches of notifications so
  // that you don't need to send 1000 requests to send 1000 notifications. We
  // recommend you batch your notifications to reduce the number of requests
  // and to compress them (notifications with similar content will get
  // compressed).
  const chunks = expo.chunkPushNotifications(messages)
  const tickets = [] as ExpoPushTicket[]
  const sendChunkedPNs = async () => {
    // Send the chunks to the Expo push notification service. There are
    // different strategies you could use. A simple one is to send one chunk at a
    // time, which nicely spreads the load out over time:
    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk)
        log(ticketChunk)
        tickets.push(...ticketChunk)
        // NOTE: If a ticket contains an error code in ticket.details.error, you
        // must handle it appropriately. The error codes are listed in the Expo
        // documentation:
        // https://docs.expo.io/push-notifications/sending-notifications/#individual-errors
      } catch (error) {
        log(error)
      }
    }
  }
  await sendChunkedPNs()
  // write successful tickets to db
  const [successTickets, errorTickets] = partition(
    tickets,
    (ticket) => ticket.status === 'ok'
  )
  await Promise.all(
    (successTickets as ExpoPushSuccessTicket[]).map(async (ticket) =>
      // TODO: let's move this to a subcollection of the user
      firestore
        .collection('pushNotificationTickets')
        .doc(ticket.id)
        .set({
          ...ticket,
          createdTime: Date.now(),
          receiptStatus: 'not-checked',
        } as PushTicket)
    )
  )
  errorTickets.forEach((ticket) =>
    log('Error generating push notification, ticket:', ticket)
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
      // TODO: let's move this to a subcollection of the user
      .collection('pushNotificationTickets')
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

      // The receipts specify whether Apple or Google successfully received the
      // notification and information about an error, if one occurred.
      for (const receiptId in receipts) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const { status, message, details } = receipts[receiptId]
        if (status === 'ok') {
          continue
        } else if (status === 'error') {
          log(`There was an error sending a notification: ${message}`)
          if (details && details.error) {
            // The error codes are listed in the Expo documentation:
            // https://docs.expo.io/push-notifications/sending-notifications/#individual-errors
            // You must handle the errors appropriately.
            log(`The error code is ${details.error}`)
          }
        }
      }
    } catch (error) {
      log(error)
    }
  }
}
