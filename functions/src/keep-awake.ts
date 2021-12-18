import * as functions from 'firebase-functions'

import { callCloudFunction } from './call-cloud-function'

export const keepAwake = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async () => {
    await Promise.all([
      callCloudFunction('placeBet'),
      callCloudFunction('resolveMarket'),
    ])
  })
