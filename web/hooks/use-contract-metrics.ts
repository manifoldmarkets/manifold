import { ContractMetric } from 'common/contract-metric'
import { uniqBy } from 'lodash'
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
      const { data: d1 } = await db
        .from('user_contract_metrics')
        .select('*')
        .eq('contract_id', contractId)
        .not('total_shares_no', 'is', null)
        .order('total_shares_no', { ascending: false })
        .limit(100)

      const { data: d2 } = await db
        .from('user_contract_metrics')
        .select('*')
        .eq('contract_id', contractId)
        .not('total_shares_yes', 'is', null)
        .order('total_shares_yes', { ascending: false })
        .limit(100)
      return (d1 ?? []).concat(d2 ?? [])
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

    return [outcome, uniqBy(val, 'userId')] as const
  })

  return Object.fromEntries(entries)
}
