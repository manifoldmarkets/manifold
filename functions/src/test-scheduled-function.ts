import { APIError, newEndpoint } from './api'
import { getPrivateUser, isProd } from './utils'
import { createPushNotification } from './create-push-notification'
import { Notification } from 'common/notification'
import * as admin from 'firebase-admin'
import { checkPushNotificationReceipts } from 'functions/src/check-push-notification-receipts'

// Function for testing scheduled functions locally
export const testscheduledfunction = newEndpoint(
  { method: 'GET', memory: '4GiB' },
  async (_req) => {
    if (isProd())
      throw new APIError(400, 'This function is only available in dev mode')

    // Replace your function here
    const privateUser = await getPrivateUser('6hHpzvRG0pMq8PNJs7RZj2qlZGn2')
    //scKq24zP6RHDX7hB72xi-resolved
    const notif = await firestore
      .collection(`users/6hHpzvRG0pMq8PNJs7RZj2qlZGn2/notifications`)
      .doc('scKq24zP6RHDX7hB72xi-resolved')
      .get()
    const notification = notif.data() as Notification
    if (!privateUser || !notification) return { message: 'no user or notif' }
    await createPushNotification(
      notification,
      privateUser,
      notification.sourceTitle ?? 'test',
      'resolved'
    )
    // check receipts after 5 seconds
    await setTimeout(async () => {
      console.log('waiting')
      return await checkPushNotificationReceipts()
    }, 5000)

    return { success: true }
  }
)
const firestore = admin.firestore()
