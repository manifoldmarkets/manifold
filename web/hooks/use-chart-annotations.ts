import { ChartAnnotation } from 'common/supabase/chart-annotations'
import { useEffect, useState } from 'react'
import { PointerMode } from 'web/components/charts/helpers'
import { useUser } from 'web/hooks/use-user'
import { Contract } from 'common/contract'
import { isAdminId, isModId } from 'common/envs/constants'

export const useAnnotateChartTools = (
  contract: Contract,
  staticChartAnnotations: ChartAnnotation[]
) => {
  const [pointerMode, setPointerMode] = useState<PointerMode>('zoom')
  const [hoveredAnnotation, setHoveredAnnotation] = useState<number | null>(
    null
  )
  const user = useUser()

  // TODO: make live
  const chartAnnotations = staticChartAnnotations

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

  const enableAdd =
    user &&
    (user.id === contract.creatorId || isModId(user.id) || isAdminId(user.id))
  return {
    pointerMode,
    setPointerMode,
    hoveredAnnotation,
    setHoveredAnnotation: updateHoveredAnnotation,
    chartAnnotations,
    enableAdd,
  }
}
