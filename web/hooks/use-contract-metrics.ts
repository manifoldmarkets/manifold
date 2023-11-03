import { db } from 'web/lib/supabase/db'
import { useSubscription } from 'web/lib/supabase/realtime/use-subscription'
import {
  convertContractMetricRows,
  getOrderedContractMetricRowsForContractId,
} from 'common/supabase/contract-metrics'

// NOTE: user_contract_metrics table not enabled in realtime publication
export const useRealtimeContractMetrics = (
  contractId: string,
  answerId?: string,
  limit?: number
) => {
  const { rows } = useSubscription(
    'user_contract_metrics',
    { k: 'contract_id', v: contractId },
    async () =>
      getOrderedContractMetricRowsForContractId(
        contractId,
        db,
        answerId,
        'shares',
        limit
      )
  )

  return rows ? convertContractMetricRows(rows) : undefined
}
