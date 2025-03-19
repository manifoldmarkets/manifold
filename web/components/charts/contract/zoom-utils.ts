import { HistoryPoint, maxMinBin, MultiPoints } from 'common/chart'
import { buildArray } from 'common/util/array'
import { debounce } from 'lodash'
import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { ScaleTime } from 'd3-scale'
import { getBetPointsBetween } from 'common/bets'
import { getMultiBetPoints } from 'common/contract-params'
import { MarketContract, MultiContract } from 'common/contract'

export async function getPointsBetween(
  contract: MarketContract,
  min: number,
  max: number
) {
  const points = await getBetPointsBetween(contract, {
    beforeTime: max,
    afterTime: min,
    filterRedemptions: true,
  })

  const compressed = maxMinBin(points, 500)

  return compressed
}

// only for single value contracts
export const useDataZoomFetcher = <T>(props: {
  contract: MarketContract
  viewXScale?: ScaleTime<number, number>
  points: HistoryPoint<T>[]
}) => {
  const { contract, viewXScale, points } = props
  const { id: contractId, createdTime } = contract
  const lastBetTime = contract.lastBetTime ?? createdTime
  const [data, setData] = useState(points)
  const [loading, setLoading] = useState(false)

  const onZoomData = useCallback(
    debounce(async (min: number, max: number) => {
      if (min && max) {
        setLoading(true)
        const zoomedPoints = await getPointsBetween(contract, min, max)

        setData(
          buildArray(
            points.filter((p) => p.x <= min),
            zoomedPoints,
            points.filter((p) => p.x >= max)
          ).sort((a, b) => a.x - b.x)
        )

        setLoading(false)
      } else {
        setData(points)
      }
    }, 100),
    [contractId]
  )

  useLayoutEffect(() => {
    setData(points)
  }, [contractId])

  useEffect(() => {
    if (viewXScale) {
      const [minX, maxX] = viewXScale.range()
      if (Math.abs(minX - maxX) <= 1) return
      // 20px buffer
      const min = viewXScale.invert(minX - 20).valueOf()
      const max = viewXScale.invert(maxX + 20).valueOf()
      const fixedMin = Math.max(min, createdTime)
      const fixedMax = Math.min(max, lastBetTime) + 1

      onZoomData(fixedMin, fixedMax)
    } else {
      onZoomData(createdTime, lastBetTime)
    }
  }, [viewXScale])

  return { points: data, loading }
}

export async function getMultichoicePointsBetween(
  contract: MultiContract,
  min: number,
  max: number
) {
  const allBetPoints = await getBetPointsBetween(contract, {
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
  createdTime: number
  lastBetTime: number
}) => {
  const { contract, points, createdTime, lastBetTime, viewXScale } = props
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
          new Set([...Object.keys(points), ...Object.keys(zoomedPoints)])
        )

        // Process each answer ID
        allAnswerIds.forEach((answerId) => {
          // Get points for this answer ID
          const answerPoints = points[answerId] || []
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
        setData(points)
      }
    }, 100),
    [contract.id]
  )

  useLayoutEffect(() => {
    setData(points)
    if (Object.keys(points).length === 0 && viewXScale) {
      const [minX, maxX] = viewXScale.range()
      onZoomData(minX, maxX)
    }
  }, [contract.id])

  useEffect(() => {
    if (viewXScale) {
      const [minX, maxX] = viewXScale.range()
      if (Math.abs(minX - maxX) <= 1) return
      // 20px buffer
      const min = viewXScale.invert(minX - 20).valueOf()
      const max = viewXScale.invert(maxX + 20).valueOf()
      const fixedMin = Math.max(min, createdTime)
      const fixedMax = Math.min(max, lastBetTime) + 1

      onZoomData(fixedMin, fixedMax)
    } else {
      onZoomData()
    }
  }, [viewXScale])

  return { points: data, loading }
}
