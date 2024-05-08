/* eslint-disable */
import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import { getLocalEnv } from 'shared/init-admin'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import * as admin from 'firebase-admin'
import { updateUserMetricsCore } from 'shared/update-user-metrics-core'
import { DAY_MS } from 'common/util/time'
import { calculateUserTopicInterests } from 'shared/calculate-user-topic-interests'
import { updateCreatorMetricsCore } from 'shared/update-creator-metrics-core'
import { calculateImportanceScore } from 'shared/importance-score'

// Ian's file for debugging
export async function testBackendFunction() {
  const credentials = getServiceAccountCredentials(getLocalEnv())
  await loadSecretsToEnv(credentials)
  try {
    const pg = createSupabaseDirectClient()
    const db = createSupabaseClient()
    const firestore = admin.firestore()
    // const MAX_DAYS = 100
    // const now = Date.now()
    // console.log('Starting topic interests')
    // const startTimes = []
    // for (let i = 0; i < MAX_DAYS; i++) {
    //   const startTime = now - DAY_MS * (MAX_DAYS - i)
    //   console.log('Topic interests iteration:', i)
    //   await calculateUserTopicInterests(startTime)
    //   startTimes.push(new Date(startTime).toISOString())
    // }
    // console.log('all start times:', startTimes)
    // await calculateImportanceScore(db, pg)
    // await updateContractMetricsCore()
    // await updateUserMetricsCore()
    // await updateCreatorMetricsCore()
  } catch (e) {
    console.error(e)
  }
}
