import { runScript } from 'run-script'
import { sendContractMovementNotifications } from 'shared/send-contract-movement-notifications'

runScript(async () => {
  await sendContractMovementNotifications(true)
})
