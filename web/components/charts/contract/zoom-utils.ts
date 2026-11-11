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
  addLivePoints,
  addMultiPoints,
  chooseChartPoints,
  CoveredMultiPoints,
  FetchedMultiPoints,
  getKnownStepValueAt,
  getTailToReconcile,
  getUncoveredAnswerIds,
  getWholeHistoryCoverage,
  getZoomWindow,
  latestDefined,
  movedProbability,
  widerHistory,
} from 'common/multi-chart'
import { buildArray } from 'common/util/array'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { useEvent } from 'client-common/hooks/use-event'
import { getMultiBetPointsFromBets } from 'client-common/lib/choice'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { ValueStore } from 'web/hooks/use-value-store'

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
// How far before the left edge of a view, or before the market opened, a
// fetch starts.
const FETCH_LEAD_MS = 1000
// The most live points kept for one answer before the older ones are thinned.
const MAX_LIVE_POINTS_PER_ANSWER = 1000

const NO_POINTS: MultiPoints = {}
const NOT_LOADING = { zoomed: false, allTime: false }

// only for multichoice contracts
//
// Decides which points the chart draws.
//
// With the whole history on screen, that is the history the page was rendered
// with, and nothing is fetched for it. If an answer on the chart was rendered
// without a line (a market with many answers has none at all), the whole
// history is fetched, once per set of answers that lack one. A zoomed window
// is fetched when the view settles.
//
// Bets that arrive while the page is open are added from the live feed, with
// the redemption rows that carry the other answers' moves, so no bet causes a
// fetch. The live feed can miss bets, so the stretch since the last bet the
// chart is sure of is fetched again at the moments the chart used to fetch
// everything: when it is first drawn, when the user comes back to the whole
// history or to the page, and when the page's own feed turns up a bet the
// live feed did not deliver.
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
  // The time of the newest bet the page's own feed holds, if it holds any.
  // That feed catches up after a gap, but leaves out the redemption rows.
  latestPageBetTime: number | undefined
  // Whether `contract` holds every answer of the market. A big market's page
  // starts with only its top answers, and the rest arrive with the live
  // contract.
  hasAllAnswers: boolean
  // Whether the chart is zoomed in on part of the market's life.
  isZoomed: boolean
  // The answers the chart is drawing.
  graphedAnswerIds: string[]
  // The answer the chart previews while the pointer rests on its row. It is
  // kept outside React state, so it is read here only when it changes.
  previewStore: ValueStore<string | undefined>
}) => {
  const { contract, points, createdTime, lastBetTime, viewXScale } = props
  const { serverLastBetTime, serverPointAnswerIds, latestPageBetTime } = props
  const { hasAllAnswers, isZoomed, graphedAnswerIds, previewStore } = props
  const isPageVisible = useIsPageVisible()

  // The latest fetch of a zoomed window, and of the whole history.
  const [zoomed, setZoomed] = useState<FetchedMultiPoints>()
  const [allTime, setAllTime] = useState<FetchedMultiPoints>()
  // The probability moves since the page opened: from the live feed, and from
  // fetches of the tail that fill in what the live feed missed.
  const [live, setLive] = useState(NO_POINTS)
  // The latest bet the live feed has delivered, whether it moved anything.
  const [latestLiveBetTime, setLatestLiveBetTime] = useState<number>()
  // The latest bet a fetch of the tail has brought.
  const [tailUntil, setTailUntil] = useState<number>()
  // An answer that was previewed and has no whole history to draw.
  const [previewedWithoutHistory, setPreviewedWithoutHistory] =
    useState<string>()
  const [loading, setLoading] = useState(NOT_LOADING)
  // Each fetch takes the next number of its kind. A response is used only if
  // no later fetch of that kind has started, so a slow response cannot
  // overwrite a newer one.
  const latestRequest = useRef({ zoomed: 0, allTime: 0, tail: 0 })
  // The fetch that holds the most of the market's whole history, and the time
  // of the last bet in it. Read to place quiet answers in past windows.
  const wholeHistory = useRef<CoveredMultiPoints>()
  // The answers a whole-history fetch that is still on its way will cover.
  const allTimeOnItsWay = useRef<Set<string>>()

  useEffect(() => {
    // A different market: drop what was fetched for the last one.
    latestRequest.current.zoomed++
    latestRequest.current.allTime++
    latestRequest.current.tail++
    wholeHistory.current = undefined
    allTimeOnItsWay.current = undefined
    setZoomed(undefined)
    setAllTime(undefined)
    setLive(NO_POINTS)
    setLatestLiveBetTime(undefined)
    setTailUntil(undefined)
    setPreviewedWithoutHistory(undefined)
    setLoading(NOT_LOADING)
  }, [contract.id])

  // The page's own feed of new bets leaves redemptions out, and in a market
  // whose answers sum to one those are the rows that move the other answers.
  // This takes every row that moved a probability.
  const onNewBets = useEvent((msg: ServerMessage<'broadcast'>) => {
    const bets = (msg.data as { bets?: Bet[] }).bets ?? []
    const latest = latestDefined(bets.map((bet) => bet.createdTime))
    if (latest === undefined) return
    setLatestLiveBetTime((known) => latestDefined([known, latest]))
    const moved = bets.filter(movedProbability)
    if (moved.length > 0)
      setLive((prev) =>
        addLivePoints(
          prev,
          getMultiBetPointsFromBets(moved),
          MAX_LIVE_POINTS_PER_ANSWER
        )
      )
  })
  useApiSubscription({
    topics: [`contract/${contract.id}/new-bet`],
    onBroadcast: onNewBets,
  })

  // The answers on the chart that have no whole history to draw: neither a
  // line the page was rendered with, nor a place in a fetched whole history.
  const answerIds = useMemo(
    () => contract.answers.map((a) => a.id),
    [contract.answers]
  )
  const getUncovered = (neededIds: string[]) =>
    getUncoveredAnswerIds({
      neededIds,
      knownIds: answerIds,
      serverIds: serverPointAnswerIds,
      fetchedIds: allTime?.answerIds,
    })
  const uncoveredKey = useMemo(
    () =>
      getUncovered(
        previewedWithoutHistory === undefined
          ? graphedAnswerIds
          : [...graphedAnswerIds, previewedWithoutHistory]
      ).join(','),
    [
      graphedAnswerIds,
      previewedWithoutHistory,
      answerIds,
      serverPointAnswerIds,
      allTime,
    ]
  )
  const hasWholeHistory = uncoveredKey === ''

  // A previewed answer is not among the graphed ones. If it has no whole
  // history, note it, which is what gets one fetched.
  const onPreview = useEvent(() => {
    const id = previewStore.get()
    if (id !== undefined && getUncovered([id]).length > 0)
      setPreviewedWithoutHistory(id)
  })
  useEffect(() => previewStore.subscribe(onPreview), [previewStore])

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

  const fetchPoints = async (window: {
    min: number
    max: number
    reachedLastBet: boolean
  }): Promise<FetchedMultiPoints> => {
    const { min, max } = window
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
    return {
      ...window,
      data,
      // `contract` is the one the request was made with.
      answerIds: contract.answers.map((a) => a.id),
      latestBetTime,
    }
  }

  const fetchWindow = useEvent(
    async (
      window: { min: number; max: number; reachedLastBet: boolean },
      kind: 'zoomed' | 'allTime'
    ) => {
      const request = ++latestRequest.current[kind]
      const isLatest = () => request === latestRequest.current[kind]
      setLoading((l) => ({ ...l, [kind]: true }))
      if (kind === 'allTime')
        allTimeOnItsWay.current = new Set(contract.answers.map((a) => a.id))
      try {
        const fetched = await fetchPoints(window)
        if (!isLatest()) return
        if (kind === 'allTime') setAllTime(fetched)
        else setZoomed(fetched)
      } catch (e) {
        // Leave what is on screen. The next zoom, or a reload, tries again.
        console.error('Failed to load chart points', e)
      } finally {
        if (isLatest()) {
          setLoading((l) => ({ ...l, [kind]: false }))
          if (kind === 'allTime') allTimeOnItsWay.current = undefined
        }
      }
    }
  )

  const view = getViewWindow(viewXScale)
  const isLaidOut = !!view
  const viewMin = view?.[0]
  const viewMax = view?.[1]

  // The whole history, for the answers on the chart that have none. Asked for
  // again only when that set of answers changes, and not while a fetch that
  // will cover them is on its way: on a large market one can take a while, and
  // the chart's answers can change several times in the meantime.
  //
  // It waits for the market's full answer list. A fetch only yields lines for
  // the answers the contract had when it was made, so one made with the
  // page's shortened list would have to be made again.
  useEffect(() => {
    if (!isLaidOut || isZoomed || uncoveredKey === '' || !hasAllAnswers) return
    const onItsWay = allTimeOnItsWay.current
    if (onItsWay && uncoveredKey.split(',').every((id) => onItsWay.has(id)))
      return
    fetchWindow(
      {
        min: createdTime - FETCH_LEAD_MS,
        max: lastBetTime + 1,
        reachedLastBet: true,
      },
      'allTime'
    )
  }, [isLaidOut, isZoomed, uncoveredKey, hasAllAnswers])

  // A zoomed window, once the view settles. A new bet moves lastBetTime, but
  // its points arrive on the live feed, so it is no reason to fetch again.
  // The window is worked out when the timer fires, from the last bet known
  // then.
  const fetchZoomedView = useEvent((min: number, max: number) =>
    fetchWindow(
      getZoomWindow({
        view: { min, max },
        createdTime,
        lastBetTime,
        leadMs: FETCH_LEAD_MS,
      }),
      'zoomed'
    )
  )
  useEffect(() => {
    if (!isZoomed || viewMin === undefined || viewMax === undefined) return
    const timer = setTimeout(
      () => fetchZoomedView(viewMin, viewMax),
      ZOOM_FETCH_DELAY_MS
    )
    return () => clearTimeout(timer)
  }, [isZoomed, viewMin, viewMax])

  // The last bet the whole history on the chart is sure to include. Live bets
  // do not move it on: the feed that brings them can miss some.
  const completeUntil = latestDefined([
    serverLastBetTime,
    allTime?.latestBetTime,
    tailUntil,
  ])
  // The page's own feed holds a bet the live feed never delivered: it was
  // made before the page subscribed, or while the connection was down.
  const hasUndeliveredBet =
    completeUntil !== undefined &&
    latestPageBetTime !== undefined &&
    latestPageBetTime > completeUntil &&
    latestPageBetTime > (latestLiveBetTime ?? -Infinity)

  const fetchTail = useEvent(async () => {
    const tail = getTailToReconcile({
      completeUntil,
      lastBetTime,
      latestPageBetTime,
    })
    if (!tail) return
    const request = ++latestRequest.current.tail
    try {
      const fetched = await fetchPoints({ ...tail, reachedLastBet: true })
      if (request !== latestRequest.current.tail) return
      setLive((prev) =>
        addLivePoints(prev, fetched.data, MAX_LIVE_POINTS_PER_ANSWER)
      )
      setTailUntil((known) => latestDefined([known, fetched.latestBetTime]))
    } catch (e) {
      console.error('Failed to load recent chart points', e)
    }
  })
  // Not on every bet: the live feed draws those. At the moments listed at the
  // top, if the page knows of a bet later than the chart is sure of.
  useEffect(() => {
    if (isLaidOut && !isZoomed && isPageVisible) fetchTail()
  }, [
    isLaidOut,
    isZoomed,
    isPageVisible,
    hasUndeliveredBet,
    completeUntil === undefined,
  ])

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
