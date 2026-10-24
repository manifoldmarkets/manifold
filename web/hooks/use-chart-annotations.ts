import { useState, useEffect } from 'react'
import { PointerMode } from 'web/components/charts/helpers'
import { useUser } from 'web/hooks/use-user'
import { Contract } from 'common/contract'
import { isAdminId, isModId } from 'common/envs/constants'
import {
  ChartAnnotation,
  getChartAnnotations,
} from 'common/supabase/chart-annotations'
import { db } from 'web/lib/supabase/db'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { sortBy, uniqBy } from 'lodash'

export const useAnnotateChartTools = (
  contract: Contract,
  initialChartAnnotations: ChartAnnotation[]
) => {
  const [pointerMode, setPointerMode] = useState<PointerMode>('zoom')
  const [hoveredAnnotation, setHoveredAnnotation] = useState<number | null>(
    null
  )
  const user = useUser()
  const [chartAnnotations, setChartAnnotations] = useState<ChartAnnotation[]>(
    initialChartAnnotations
  )

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

  useApiSubscription({
    topics: [`contract/${contract.id}/chart-annotation`],
    getSnapshot: async () => {
      const result = await getChartAnnotations(contract.id, db)
      return () => setChartAnnotations(result)
    },
    onBroadcast: (msg) => {
      const newAnnotation = msg.data.annotation as ChartAnnotation
      setChartAnnotations((prevAnnotations) =>
        sortBy(
          uniqBy([...prevAnnotations, newAnnotation], 'id'),
          (c) => c.event_time
        )
      )
    },
  })

  const enableAdd =
    user &&
    (user.id === contract.creatorId || isModId(user.id) || isAdminId(user.id))
  // Can only annotate because the user is a mod or admin
  const addIsModAction = !!enableAdd && user?.id !== contract.creatorId

  return {
    pointerMode,
    setPointerMode,
    hoveredAnnotation,
    setHoveredAnnotation: updateHoveredAnnotation,
    chartAnnotations,
    enableAdd,
    addIsModAction,
  }
}
