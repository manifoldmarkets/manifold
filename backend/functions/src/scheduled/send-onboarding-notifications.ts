import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { secrets } from 'common/secrets'
import { sendOnboardingNotificationsInternal } from 'shared/onboarding-helpers'

export const sendOnboardingNotifications = functions
  .runWith({ secrets, memory: '512MB', timeoutSeconds: 540 })
  .pubsub.schedule('0 11 * * *')
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    await sendOnboardingNotificationsInternal(admin.firestore())
  })
