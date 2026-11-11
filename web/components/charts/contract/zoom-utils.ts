import { HistoryPoint, maxMinBin, MultiPoints } from 'common/chart'
import { debounce, maxBy, minBy } from 'lodash'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ScaleTime } from 'd3-scale'
import { ServerMessage } from 'common/api/websockets'
import { Bet } from 'common/bet'
import {
  AnswerProbAtStart,
  getBetPointsAndLatestBetTime,
  getBetPointsBetween,
} from 'common/bets'
import { getMultiBetPoints } from 'common/contract-params'
import { CPMMContract, MarketContract, MultiContract } from 'common/contract'
import {
  addMultiPoints,
  chooseChartPoints,
  CoveredMultiPoints,
  FetchedMultiPoints,
  getKnownStepValueAt,
  getWholeHistoryCoverage,
  movedProbability,
  widerHistory,
} from 'common/multi-chart'
import { buildArray } from 'common/util/array'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { useEvent } from 'client-common/hooks/use-event'
import { getMultiBetPointsFromBets } from 'client-common/lib/choice'

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
  contract: CPMMContract
  viewXScale?: ScaleTime<number, number>
  points: HistoryPoint<T>[]
}) => {
  const { contract, viewXScale } = props
  const { id: contractId, createdTime } = contract
  const lastBetTime = contract.lastBetTime ?? createdTime
  const [data, setData] = useState(props.points)
  const [loading, setLoading] = useState(false)

  const onZoomData = useEvent(
    debounce(async (min: number, max: number) => {
      if (min && max) {
        setLoading(true)
        const zoomedPoints = await getPointsBetween(contract, min, max)
        const pointsAfterMax = data.filter((p) => p.x >= max)
        const pointsBeforeMin = data.filter((p) => p.x <= min)
        const latestPointBeforeMin = maxBy(pointsBeforeMin, 'x')
        const earliestPointAfterMax = minBy(pointsAfterMax, 'x')
        setData(
          buildArray(
            zoomedPoints.length > 0
              ? (zoomedPoints as HistoryPoint<T>[])
              : [latestPointBeforeMin, earliestPointAfterMax]
          ).sort((a, b) => a.x - b.x)
        )

        setLoading(false)
      } else {
        setData(props.points)
      }
    }, 100)
  )

  useLayoutEffect(() => {
    setData(props.points)
  }, [contractId])

  useEffect(() => {
    if (viewXScale) {
      const [minX, maxX] = viewXScale.range()
      if (Math.abs(minX - maxX) <= 1) return
      const min = viewXScale.invert(minX).valueOf()
      const max = viewXScale.invert(maxX).valueOf()
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
  max: number,
  getAnswerProbAtStart?: AnswerProbAtStart
) {
  const { points, latestBetTime } = await getBetPointsAndLatestBetTime(
    contract,
    {
      filterRedemptions: false,
      includeZeroShareRedemptions: true,
      beforeTime: max,
      afterTime: min,
    },
    getAnswerProbAtStart
  )
  // latestBetTime: the last bet in the response, which may be a reused one
  // from before the market's latest bets.
  return { multiPoints: getMultiBetPoints(points, contract), latestBetTime }
}

// The stretch of time a chart is showing, in milliseconds. Undefined until the
// chart has been laid out.
const getViewWindow = (viewXScale: ScaleTime<number, number> | undefined) => {
  if (!viewXScale) return undefined
  const [minX, maxX] = viewXScale.range()
  if (Math.abs(minX - maxX) <= 1) return undefined
  return [
    viewXScale.invert(minX).valueOf(),
    viewXScale.invert(maxX).valueOf(),
  ] as const
}

// How long the view must hold still before a zoomed window is fetched.
// Zooming and panning move it many times a second.
const ZOOM_FETCH_DELAY_MS = 100

const NO_POINTS: MultiPoints = {}
const NOT_LOADING = { zoomed: false, allTime: false }

// only for multichoice contracts
//
// Decides which points the chart draws.
//
// With the whole history on screen, that is the history the page was rendered
// with, and nothing is fetched for it. A page rendered without chart points (a
// market with many answers) fetches the whole history once. A zoomed window is
// fetched when the view settles.
//
// Bets that arrive while the page is open are added from the live feed, with
// the redemption rows that carry the other answers' moves, so no bet causes a
// fetch.
export const useMultiChoiceDataZoomFetcher = (props: {
  contract: MultiContract
  viewXScale?: ScaleTime<number, number>
  // The history the page was rendered with, plus the bets that arrived since.
  points: MultiPoints
  createdTime: number
  lastBetTime: number
  // The time of the latest bet among the rows the server-rendered history in
  // `points` was made from. Undefined if there were none.
  serverLastBetTime: number | undefined
  // The answers the page was rendered with a chart line for. None for a
  // market with many answers, which is rendered without chart points.
  serverPointAnswerIds: string[]
  // Whether the chart is zoomed in on part of the market's life.
  isZoomed: boolean
  // The answers the chart is drawing.
  graphedAnswerIds: string[]
}) => {
  const { contract, points, createdTime, lastBetTime, viewXScale } = props
  const { serverLastBetTime, serverPointAnswerIds } = props
  const { isZoomed, graphedAnswerIds } = props

  // The latest fetch of a zoomed window, and of the whole history.
  const [zoomed, setZoomed] = useState<FetchedMultiPoints>()
  const [allTime, setAllTime] = useState<FetchedMultiPoints>()
  // Every probability move the live feed has delivered since the page opened.
  const [live, setLive] = useState(NO_POINTS)
  const [loading, setLoading] = useState(NOT_LOADING)
  // Each fetch takes the next number of its kind. A response is used only if
  // no later fetch of that kind has started, so a slow response cannot
  // overwrite a newer one.
  const latestRequest = useRef({ zoomed: 0, allTime: 0 })
  // The fetch that holds the most of the market's whole history, and the time
  // of the last bet in it. Read to place quiet answers in past windows.
  const wholeHistory = useRef<CoveredMultiPoints>()

  useEffect(() => {
    // A different market: drop what was fetched for the last one.
    latestRequest.current.zoomed++
    latestRequest.current.allTime++
    wholeHistory.current = undefined
    setZoomed(undefined)
    setAllTime(undefined)
    setLive(NO_POINTS)
    setLoading(NOT_LOADING)
  }, [contract.id])

  // The page's own feed of new bets leaves redemptions out, and in a market
  // whose answers sum to one those are the rows that move the other answers.
  // This takes every row that moved a probability.
  const onNewBets = useEvent((msg: ServerMessage<'broadcast'>) => {
    const bets = ((msg.data as { bets?: Bet[] }).bets ?? []).filter(
      movedProbability
    )
    if (bets.length > 0)
      setLive((prev) => addMultiPoints(prev, getMultiBetPointsFromBets(bets)))
  })
  useApiSubscription({
    topics: [`contract/${contract.id}/new-bet`],
    onBroadcast: onNewBets,
  })

  // Whether there is a whole history to draw for every graphed answer: one
  // that was fetched, or the one the page came with.
  const hasWholeHistory = useMemo(() => {
    if (allTime) return true
    const fromServer = new Set(serverPointAnswerIds)
    return graphedAnswerIds.every((id) => fromServer.has(id))
  }, [allTime, serverPointAnswerIds, graphedAnswerIds])

  // A fetched whole history ends at the last bet the page knew of when it was
  // asked for. The page's own points have the bets it has heard of since, and
  // the live feed has those with the other answers' moves as well.
  const allTimePoints = useMemo(
    () =>
      addMultiPoints(
        allTime ? addMultiPoints(allTime.data, points) : points,
        live
      ),
    [allTime, points, live]
  )

  const fetchPoints = async (
    min: number,
    max: number
  ): Promise<FetchedMultiPoints> => {
    const { multiPoints, latestBetTime } = await getMultichoicePointsBetween(
      contract,
      min,
      max,
      // For an answer with no bet in a window that ends before the market's
      // last bet: where a full-history line stood when the window opened.
      // A history only answers for the time it covers. A fetched one covers
      // up to the last bet that came back with it. The page's own covers up
      // to the server render: the bets it has gained since come without the
      // redemption rows that move the other answers.
      (answerId) =>
        getKnownStepValueAt(
          [
            ...(wholeHistory.current ? [wholeHistory.current] : []),
            { points, coveredUntil: serverLastBetTime },
          ],
          answerId,
          min
        )
    )
    const data: MultiPoints = {}
    for (const answerId of Object.keys(multiPoints)) {
      data[answerId] = multiPoints[answerId]
        .map(([x, y]) => ({ x, y }))
        .sort((a, b) => a.x - b.x)
    }
    // A fetch from before the market opened holds its whole history up to the
    // last bet that came back. Keep the one that reaches furthest.
    wholeHistory.current = widerHistory(wholeHistory.current, {
      points: data,
      coveredUntil: getWholeHistoryCoverage(
        { min, latestBetTime },
        createdTime
      ),
    })
    // `lastBetTime` is the last bet known as this fetch is sent.
    return { min, max, reachedLastBet: max > lastBetTime, data }
  }

  const fetchWindow = useEvent(
    async (min: number, max: number, kind: 'zoomed' | 'allTime') => {
      const request = ++latestRequest.current[kind]
      const isLatest = () => request === latestRequest.current[kind]
      setLoading((l) => ({ ...l, [kind]: true }))
      try {
        const fetched = await fetchPoints(min, max)
        if (!isLatest()) return
        if (kind === 'allTime') setAllTime(fetched)
        else setZoomed(fetched)
      } catch (e) {
        // Leave what is on screen. The next zoom, or a reload, tries again.
        console.error('Failed to load chart points', e)
      } finally {
        if (isLatest()) setLoading((l) => ({ ...l, [kind]: false }))
      }
    }
  )

  const view = getViewWindow(viewXScale)
  const isLaidOut = !!view
  const viewMin = view?.[0]
  const viewMax = view?.[1]

  // Fetches end a millisecond past the last bet the page knows of, and no
  // further. A window that reached past it could be answered now and the
  // answer reused later, when it no longer holds every bet of the window.

  // The whole history, once, if the page came without it.
  useEffect(() => {
    if (isLaidOut && !isZoomed && !hasWholeHistory)
      fetchWindow(createdTime - 1000, lastBetTime + 1, 'allTime')
  }, [isLaidOut, isZoomed, hasWholeHistory])

  // A zoomed window, once the view settles. A new bet moves lastBetTime, but
  // its points arrive on the live feed, so it is no reason to fetch again.
  useEffect(() => {
    if (!isZoomed || viewMin === undefined || viewMax === undefined) return
    const min = Math.max(viewMin, createdTime) - 1000
    const max = Math.min(viewMax, lastBetTime) + 1
    const timer = setTimeout(
      () => fetchWindow(min, max, 'zoomed'),
      ZOOM_FETCH_DELAY_MS
    )
    return () => clearTimeout(timer)
  }, [isZoomed, viewMin, viewMax])

  const data = useMemo(
    () =>
      chooseChartPoints({
        isZoomed,
        zoomed,
        wholeHistory: allTimePoints,
        hasWholeHistory,
        live,
        view:
          viewMin !== undefined && viewMax !== undefined
            ? { min: viewMin, max: viewMax }
            : undefined,
        createdTime,
      }),
    [
      isZoomed,
      zoomed,
      allTimePoints,
      hasWholeHistory,
      live,
      viewMin,
      viewMax,
      createdTime,
    ]
  )

  return {
    points: data,
    loading: isZoomed ? loading.zoomed : loading.allTime,
  }
}
