import { db } from 'web/lib/supabase/db'
import { useSubscription } from 'web/lib/supabase/realtime/use-subscription'
import { getChartAnnotations } from 'common/supabase/chart-annotations'

export const useChartAnnotations = (contractId: string) => {
  const { rows: annotations } = useSubscription(
    'chart_annotations',
    { k: 'contract_id', v: contractId },
    () => getChartAnnotations(contractId, db)
  )

  return annotations
}
