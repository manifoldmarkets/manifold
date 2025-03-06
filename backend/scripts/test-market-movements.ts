import { runScript } from 'run-script'
import { sendMarketMovementNotifications } from 'shared/send-market-movement-notifications'

runScript(async () => {
  await sendMarketMovementNotifications(true)
})
