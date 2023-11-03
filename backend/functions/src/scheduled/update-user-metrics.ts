import * as functions from 'firebase-functions'
import { secrets } from 'common/secrets'
import { updateUserMetricsCore } from 'shared/update-user-metrics-core'

export const updateUserMetrics = functions
  .runWith({
    memory: '4GB',
    timeoutSeconds: 540,
    secrets,
  })
  .pubsub.schedule('every 10 minutes')
  .onRun(async () => {
    await updateUserMetricsCore()
  })
