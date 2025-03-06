import { runScript } from 'run-script'
import { sendMarketMovementNotifications } from 'shared/send-contract-movement-notifications'

runScript(async () => {
  await sendMarketMovementNotifications(true)
})
