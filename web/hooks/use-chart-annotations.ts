import { db } from 'web/lib/supabase/db'
import { useSubscription } from 'web/lib/supabase/realtime/use-subscription'
import {
  ChartAnnotation,
  getChartAnnotations,
} from 'common/supabase/chart-annotations'
import { orderBy } from 'lodash'
import { useEffect, useState } from 'react'
import { PointerMode } from 'web/components/charts/helpers'
import { useUser } from 'web/hooks/use-user'
import { Contract } from 'common/contract'

export const useChartAnnotations = (contractId: string) => {
  const { rows: annotations } = useSubscription(
    'chart_annotations',
    { k: 'contract_id', v: contractId },
    () => getChartAnnotations(contractId, db)
  )

  return orderBy(annotations, (a) => a.event_time, 'asc')
}

export const useAnnotateChartTools = (
  contract: Contract,
  staticChartAnnotations: ChartAnnotation[]
) => {
  const [pointerMode, setPointerMode] = useState<PointerMode>('zoom')
  const [hoveredAnnotation, setHoveredAnnotation] = useState<number | null>(
    null
  )
  const user = useUser()
  const chartAnnotations =
    useChartAnnotations(contract.id) ?? staticChartAnnotations
  const updateHoveredAnnotation = async (hoveredAnnotation: number | null) => {
    if (pointerMode === 'annotate') return

    if (hoveredAnnotation !== null) {
      setPointerMode('examine')
    } else {
      setPointerMode('zoom')
    }
    setHoveredAnnotation(hoveredAnnotation)
  }
  useEffect(() => {
    if (pointerMode === 'annotate') setPointerMode('zoom')
  }, [chartAnnotations.length])

  const enableAdd = user?.id === contract.creatorId
  return {
    pointerMode,
    setPointerMode,
    hoveredAnnotation,
    setHoveredAnnotation: updateHoveredAnnotation,
    chartAnnotations,
    enableAdd,
  }
}
