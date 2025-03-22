import { runScript } from 'run-script'
import { sendUnseenMarketMovementPushNotifications } from 'shared/send-unseen-notifications'
runScript(async () => {
  // await sendMarketMovementNotifications(true)
  await sendUnseenMarketMovementPushNotifications()
})
