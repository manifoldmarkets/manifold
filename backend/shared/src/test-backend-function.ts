/* eslint-disable */
import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import { getLocalEnv } from 'shared/init-admin'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateUserMetricPeriods } from './update-user-metric-periods'
import { updateCreatorMetricsCore } from 'shared/update-creator-metrics-core'
import { calculateImportanceScore } from 'shared/importance-score'
import { backfillUserTopicInterests } from 'shared/backfill-user-topic-interests'
import { updateUserPortfolioHistoriesCore } from './update-user-portfolio-histories-core'
import { updateContractMetricsCore } from './update-contract-metrics-core'
import { updateUserMetricsWithBets } from 'shared/update-user-metrics-with-bets'

// Ian's file for debugging
export async function testBackendFunction() {
  const credentials = getServiceAccountCredentials(getLocalEnv())
  await loadSecretsToEnv(credentials)
  try {
    const pg = createSupabaseDirectClient()
    // await backfillUserTopicInterests(pg)
    // await calculateImportanceScore(db, pg)
    // await updateContractMetricsCore()
    await updateUserMetricPeriods(['xoo782zW9geixafwEaT7B9Ku3Bj1'])
    // await updateUserMetricsWithBets()
    // await updateUserPortfolioHistoriesCore(['AJwLWoo3xue32XIiAVrL5SyR1WB2'])
    // await updateCreatorMetricsCore()
  } catch (e) {
    console.error(e)
  }
}
