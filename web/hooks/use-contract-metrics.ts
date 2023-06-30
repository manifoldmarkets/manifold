import {
  ContractMetric,
  ContractMetricsByOutcome,
} from 'common/contract-metric'
import { db } from 'web/lib/supabase/db'
import { useSubscription } from 'web/lib/supabase/realtime/use-subscription'

export const useRealtimeContractMetrics = (
  contractId: string,
  outcomes: string[]
) => {
  const { rows } = useSubscription(
    'user_contract_metrics',
    { k: 'contract_id', v: contractId },
    async () => {
      const { data } = await db
        .from('user_contract_metrics')
        .select()
        .eq('contract_id', contractId)
      return data ?? []
    }
  )

  if (!rows) {
    return undefined
  }

  const entries = outcomes.map((outcome) => {
    const val = rows
      .map((row) => row.data as ContractMetric)
      .filter((metrics) => {
        return metrics.totalShares[outcome] > 0.1
      })
      .sort((a, b) => b.totalShares[outcome] - a.totalShares[outcome])

    return [outcome, val]
  })

  return Object.fromEntries(entries) as ContractMetricsByOutcome
}
