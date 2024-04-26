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

// Ian's file for debugging
export async function testBackendFunction() {
  const credentials = getServiceAccountCredentials(getLocalEnv())
  await loadSecretsToEnv(credentials)
  try {
    const pg = createSupabaseDirectClient()
    const db = createSupabaseClient()
    const firestore = admin.firestore()
    // for (let i = 0; i < 50; i++) {
    //   const startTime = Date.now() - DAY_MS * (50 - i)
    //   await calculateUserTopicInterests(startTime)
    // }
    // await updateContractMetricsCore()
    // await updateUserMetricsCore()
    await updateCreatorMetricsCore()
  } catch (e) {
    console.error(e)
  }
}
