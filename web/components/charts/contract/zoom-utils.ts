import { HistoryPoint, maxMinBin, MultiPoints } from 'common/chart'
import { buildArray } from 'common/util/array'
import { debounce } from 'lodash'
import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { ScaleTime } from 'd3-scale'
import { getBetPoints } from 'common/bets'
import { getMultiBetPoints } from 'common/contract-params'
import { MultiContract } from 'common/contract'

export async function getPointsBetween(
  contractId: string,
  min?: number,
  max?: number
) {
  const points = await getBetPoints(contractId, {
    filterRedemptions: true,
    beforeTime: max,
    afterTime: min,
  })

  const compressed = maxMinBin(points, 500)

  return compressed
}

// only for single value contracts
export const useDataZoomFetcher = <T>(props: {
  contractId: string
  viewXScale?: ScaleTime<number, number>
  points: HistoryPoint<T>[]
}) => {
  const [data, setData] = useState(props.points)
  const [loading, setLoading] = useState(false)

  const onZoomData = useCallback(
    debounce(async (min?: number, max?: number) => {
      if (min && max) {
        setLoading(true)
        const points = await getPointsBetween(props.contractId, min, max)

        setData(
          buildArray(
            props.points.filter((p) => p.x <= min),
            points,
            props.points.filter((p) => p.x >= max)
          ).sort((a, b) => a.x - b.x)
        )

        setLoading(false)
      } else {
        setData(props.points)
      }
    }, 100),
    [props.contractId]
  )

  useLayoutEffect(() => {
    setData(props.points)
  }, [props.contractId])

  useEffect(() => {
    if (props.viewXScale) {
      const [minX, maxX] = props.viewXScale.range()
      // 20px buffer
      const min = props.viewXScale.invert(minX - 20).valueOf()
      const max = props.viewXScale.invert(maxX + 20).valueOf()

      onZoomData(min, max)
    } else {
      onZoomData()
    }
  }, [props.viewXScale])

  return { points: data, loading }
}

export async function getMultichoicePointsBetween(
  contract: MultiContract,
  min?: number,
  max?: number
) {
  const allBetPoints = await getBetPoints(contract.id, {
    filterRedemptions: false,
    includeZeroShareRedemptions: true,
    beforeTime: max,
    afterTime: min,
  })
  const multiPoints = getMultiBetPoints(allBetPoints, contract)

  return multiPoints
}

// only for multichoice contracts
export const useMultiChoiceDataZoomFetcher = <T>(props: {
  contract: MultiContract
  viewXScale?: ScaleTime<number, number>
  points: MultiPoints
}) => {
  const { contract, points } = props
  const [data, setData] = useState(points)
  const [loading, setLoading] = useState(false)

  const onZoomData = useCallback(
    debounce(async (min?: number, max?: number) => {
      if (min && max) {
        setLoading(true)
        const zoomedPoints = await getMultichoicePointsBetween(
          contract,
          min,
          max
        )

        // Combine the original points outside the zoom range with the zoomed points
        const newData: MultiPoints = {}

        // Get all answer IDs from both objects
        const allAnswerIds = Array.from(
          new Set([...Object.keys(props.points), ...Object.keys(zoomedPoints)])
        )

        // Process each answer ID
        allAnswerIds.forEach((answerId) => {
          // Get points for this answer ID
          const answerPoints = props.points[answerId] || []
          const zoomedAnswerPoints = zoomedPoints[answerId] || []

          // Convert serialized points to HistoryPoint objects
          const typedZoomedPoints = zoomedAnswerPoints.map(([x, y]) => ({
            x,
            y,
          }))

          // Build combined array for this answer
          newData[answerId] = buildArray(
            answerPoints.filter((p) => p.x <= min),
            typedZoomedPoints,
            answerPoints.filter((p) => p.x >= max)
          ).sort((a, b) => a.x - b.x)
        })

        setData(newData)
        setLoading(false)
      } else {
        setData(props.points)
      }
    }, 100),
    [contract.id]
  )

  useLayoutEffect(() => {
    setData(props.points)
    if (Object.keys(props.points).length === 0 && props.viewXScale) {
      const [minX, maxX] = props.viewXScale.range()
      onZoomData(minX, maxX)
    }
  }, [contract.id])

  useEffect(() => {
    if (props.viewXScale) {
      const [minX, maxX] = props.viewXScale.range()
      // 20px buffer
      const min = props.viewXScale.invert(minX - 20).valueOf()
      const max = props.viewXScale.invert(maxX + 20).valueOf()

      onZoomData(min, max)
    } else {
      onZoomData()
    }
  }, [props.viewXScale])

  return { points: data, loading }
}
