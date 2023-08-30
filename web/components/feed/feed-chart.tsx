import { BinaryContract, Contract } from 'common/contract'
import { useEffect, useMemo, useState } from 'react'
import { BinaryOverview, ContractOverview } from '../contract/contract-overview'
import {
  MultiSerializedPoint,
  SerializedPoint,
  unserializePoints,
} from 'common/chart'
import { getChartPoints } from 'common/supabase/chart-points'
import { db } from 'web/lib/supabase/db'
import { Bet } from 'common/bet'

export function FeedChart(props: { contract: BinaryContract }) {
  const { contract } = props
  const [serializedPoints, setSerializedPoints] = useState<
    MultiSerializedPoint[] | SerializedPoint<Partial<Bet>>[] | undefined
  >(undefined)

  useEffect(() => {
    getChartPoints(contract, db).then(({ allBetPoints, chartPoints }) => {
      setSerializedPoints(chartPoints)
    })
  }, [])

  const betPoints = useMemo(() => {
    if (!serializedPoints) return undefined
    const points = unserializePoints(serializedPoints)
    return points
  }, [serializedPoints])

  if (betPoints) {
    return <BinaryOverview betPoints={betPoints as any} contract={contract} />
  }

  return <></>
}
