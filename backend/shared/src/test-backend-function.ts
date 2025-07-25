/* eslint-disable */
import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import { getLocalEnv } from 'shared/init-admin'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { downsamplePortfolioHistory } from './downsample-portfolio-history'

// Ian's file for debugging
export async function testBackendFunction() {
  const credentials = getServiceAccountCredentials(getLocalEnv())
  await loadSecretsToEnv(credentials)
  try {
    const pg = createSupabaseDirectClient()
    // await backfillUserTopicInterests(pg)
    // await calculateImportanceScore(db, pg)
    // await updateContractMetricsCore()
    await downsamplePortfolioHistory()
    // await updateUserMetricPeriods(['xoo782zW9geixafwEaT7B9Ku3Bj1'])
    // await updateUserMetricsWithBets()
    // await updateUserPortfolioHistoriesCore(['AJwLWoo3xue32XIiAVrL5SyR1WB2'])
    // await updateCreatorMetricsCore()
  } catch (e) {
    console.error(e)
  }
}
