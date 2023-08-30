import { BinaryContract, Contract } from 'common/contract'
import { SetStateAction, useEffect, useMemo, useState } from 'react'
import {
  BinaryChart,
  BinaryOverview,
  ContractOverview,
} from '../contract/contract-overview'
import {
  MultiSerializedPoint,
  SerializedPoint,
  unserializePoints,
} from 'common/chart'
import { getChartPoints } from 'common/supabase/chart-points'
import { db } from 'web/lib/supabase/db'
import { Bet } from 'common/bet'
import { ScaleTime, ScaleContinuousNumeric } from 'd3-scale'

export function FeedBinaryChart(props: {
  contract: BinaryContract
  className?: string
}) {
  const { contract, className } = props
  const [serializedPoints, setSerializedPoints] = useState<
    MultiSerializedPoint[] | SerializedPoint<Partial<Bet>>[] | undefined
  >(undefined)

  useEffect(() => {
    getChartPoints(contract, db, { limit: 50 }).then(
      ({ allBetPoints, chartPoints }) => {
        setSerializedPoints(chartPoints)
      }
    )
  }, [])

  const betPoints = useMemo(() => {
    if (!serializedPoints) return undefined
    const points = unserializePoints(serializedPoints)
    return points
  }, [serializedPoints])

  if (betPoints) {
    return (
      <BinaryChart
        betPoints={betPoints as any}
        contract={contract}
        showZoomer={false}
        viewScale={{
          viewXScale: undefined,
          setViewXScale: function (
            value: SetStateAction<ScaleTime<number, number, never> | undefined>
          ): void {
            throw new Error('Function not implemented.')
          },
          viewYScale: undefined,
          setViewYScale: function (
            value: SetStateAction<
              ScaleContinuousNumeric<number, number, never> | undefined
            >
          ): void {
            throw new Error('Function not implemented.')
          },
        }}
        className={className}
      />
    )
  }

  return <></>
}
