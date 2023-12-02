import { Row, run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'
import { useSubscription } from 'web/lib/supabase/realtime/use-subscription'
export type ChartAnnotation = Row<'chart_annotations'>
export const useChartAnnotations = (contractId: string) => {
  const fetcher = async () => {
    const { data } = await run(
      db
        .from('chart_annotations')
        .select(`*`)
        .eq('contract_id', contractId)
        .order('event_time')
    )
    return data
  }
  const { rows: annotations } = useSubscription(
    'chart_annotations',
    { k: 'contract_id', v: contractId },
    fetcher
  )

  // useEffect(() => {
  //   const loadAnnotations = async () => {
  //     const { data } = await db
  //       .from('chart_annotations')
  //       .select(`*`)
  //       .eq('contract_id', contractId)
  //       .order('event_time')
  //     if (data) setAnnotations(data)
  //     else setAnnotations([])
  //   }
  //   loadAnnotations()
  // }, [contractId])

  return annotations
}
