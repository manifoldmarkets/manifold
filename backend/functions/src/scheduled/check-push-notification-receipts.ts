import { Expo } from 'expo-server-sdk'
import { PushTicket } from 'common/push-ticket'
import { log } from 'shared/utils'
import * as admin from 'firebase-admin'
import { removeUndefinedProps } from 'common/util/object'
import * as functions from 'firebase-functions'
const firestore = admin.firestore()

export const checkPushNotificationReceiptsScheduled = functions
  .runWith({ memory: '4GB' })
  // every minute on Monday for 2 hours starting at 12pm PT (UTC -07:00)
  .pubsub.schedule('every 30 minutes')
  .onRun(async () => {
    await checkPushNotificationReceipts()
  })

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
