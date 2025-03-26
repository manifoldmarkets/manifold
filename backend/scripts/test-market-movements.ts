import { runScript } from 'run-script'
import { sendMarketMovementNotifications } from 'shared/send-market-movement-notifications'
import { sendUnseenMarketMovementNotifications } from 'shared/send-unseen-notifications'
runScript(async () => {
  await sendMarketMovementNotifications(true)
  await sendUnseenMarketMovementNotifications()
})
