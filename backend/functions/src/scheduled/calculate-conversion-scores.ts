import * as functions from 'firebase-functions'
import { secrets } from 'common/secrets'

import { calculateConversionScore } from 'shared/conversion-score'

export const conversionScoreScheduler = functions
  .runWith({
    secrets,
    memory: '128MB',
    timeoutSeconds: 600,
  })
  .pubsub.schedule('0 3 * * *')
  .timeZone('America/Los_Angeles')
  .onRun(async () => {
    await calculateConversionScore()
  })
