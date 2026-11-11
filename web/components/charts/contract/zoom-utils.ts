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
  chooseChartPoints,
  CoveredMultiPoints,
  FetchedMultiPoints,
  getKnownStepValueAt,
  getUncoveredAnswerIds,
  getWholeHistoryCoverage,
  getWholeHistoryLines,
  getWholeHistoryPoints,
  getZoomWindow,
  hasUndeliveredBet,
  isBehindLastBet,
  isOnItsWay,
  latestDefined,
  movedProbability,
  WholeHistoryLines,
  WholeHistoryRequest,
  widerHistory,
  withFurtherLines,
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
// How long the chart, once on screen, waits for the live contract before it
// fetches a whole history with the contract the page was rendered with.
const LIVE_CONTRACT_WAIT_MS = 3000

const NO_POINTS: MultiPoints = {}
const NO_LINES: WholeHistoryLines = {}

// only for multichoice contracts
//
// Decides which points the chart draws.
//
// In the whole-history view, each answer's line is read from one history of
// the market: the one the page was rendered with, or a whole history fetched
// since, whichever reaches further. The line is carried on by the live bets
// made after that history's last bet. Nothing is fetched until one of two
// things calls for it:
//
// - An answer on the chart has no line (a market with many answers is
//   rendered with none at all).
// - The page knows of a bet made after the last bet in the history of a line
//   on the chart. The live feed draws such bets as they arrive, so no bet
//   causes a fetch. But the feed can miss bets, so the whole history is
//   fetched again at the moments below, if there has been a bet since:
//   when the chart is first on screen with the live contract loaded, when the
//   user comes back to the whole history or to the page, and when the page's
//   own feed turns up a bet the live feed did not deliver.
//
// A zoomed window is fetched when the view settles.
export const useMultiChoiceDataZoomFetcher = (props: {
  contract: MultiContract
  viewXScale?: ScaleTime<number, number>
  // The history the page was rendered with.
  points: MultiPoints
  createdTime: number
  // The time of the latest bet among the rows the history in `points` was
  // made from. Undefined if there were none.
  serverLastBetTime: number | undefined
  // The answers the page was rendered with a chart line for. None for a
  // market with many answers, which is rendered without chart points.
  serverPointAnswerIds: string[]
  // The time of the newest bet in the page's own feed that moved a
  // probability, if there is one. That feed catches up after a gap, but
  // leaves out the redemption rows.
  latestPageBetTime: number | undefined
  // Whether `contract` is the live one, loaded since the page opened. Until
  // then it is the one the page was rendered with: it can be behind on the
  // last bet, and a big market's has only its top answers.
  hasLiveContract: boolean
  // Whether the chart is on screen. The user can hide it.
  isShown: boolean
  // Whether the chart is zoomed in on part of the market's life.
  isZoomed: boolean
  // The answers the chart is drawing.
  graphedAnswerIds: string[]
  // The answer the chart previews while the pointer rests on its row. It is
  // kept outside React state, so it is read here only when it changes.
  previewStore: ValueStore<string | undefined>
}) => {
  const { contract, points, createdTime, viewXScale } = props
  const { serverLastBetTime, serverPointAnswerIds, latestPageBetTime } = props
  const { hasLiveContract, isShown, isZoomed } = props
  const { graphedAnswerIds, previewStore } = props
  const isPageVisible = useIsPageVisible()

  // The latest fetch of a zoomed window.
  const [zoomed, setZoomed] = useState<FetchedMultiPoints>()
  // The whole-history lines that have been fetched.
  const [fetchedLines, setFetchedLines] = useState(NO_LINES)
  // The probability moves the live feed has delivered since the page opened.
  const [live, setLive] = useState(NO_POINTS)
  // The latest bet the live feed has delivered that moved a probability.
  const [latestLiveBetTime, setLatestLiveBetTime] = useState<number>()
  // An answer that was previewed and has no whole-history line.
  const [previewedWithoutHistory, setPreviewedWithoutHistory] =
    useState<string>()
  const [hasWaitedForLiveContract, setHasWaitedForLiveContract] =
    useState(false)
  const [isLoadingZoomed, setIsLoadingZoomed] = useState(false)
  const [wholeHistoryRequestCount, setWholeHistoryRequestCount] = useState(0)
  // Each fetch of a zoomed window takes the next number. A response is used
  // only if no later one has started, so a slow response cannot overwrite a
  // newer one. Whole-history responses need no such number: a line is only
  // replaced by one from a history that reaches at least as far, whatever
  // order they arrive in.
  const latestZoomRequest = useRef(0)
  // The whole-history requests that have not come back.
  const wholeHistoryRequests = useRef<WholeHistoryRequest[]>([])
  // Goes up when the market changes, so a response for the last one is dropped.
  const market = useRef(0)
  // The fetch that holds the most of the market's whole history, and the time
  // of the last bet in it. Read to place quiet answers in past windows.
  const wholeHistory = useRef<CoveredMultiPoints>()

  useEffect(() => {
    // A different market: drop what was fetched for the last one.
    latestZoomRequest.current++
    market.current++
    wholeHistoryRequests.current = []
    wholeHistory.current = undefined
    setZoomed(undefined)
    setFetchedLines(NO_LINES)
    setLive(NO_POINTS)
    setLatestLiveBetTime(undefined)
    setPreviewedWithoutHistory(undefined)
    setHasWaitedForLiveContract(false)
    setIsLoadingZoomed(false)
    setWholeHistoryRequestCount(0)
  }, [contract.id])

  // The page's own feed of new bets leaves redemptions out, and in a market
  // whose answers sum to one those are the rows that move the other answers.
  // This takes every row that moved a probability, and no others: an order
  // that has not been filled is a row too, and the chart has no use for it.
  const onNewBets = useEvent((msg: ServerMessage<'broadcast'>) => {
    const bets = (msg.data as { bets?: Bet[] }).bets ?? []
    const moved = bets.filter(movedProbability)
    const latest = latestDefined(moved.map((bet) => bet.createdTime))
    if (latest === undefined) return
    setLatestLiveBetTime((known) => latestDefined([known, latest]))
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

  // Each answer's whole-history line: the one the page was rendered with, or
  // a fetched one that reaches at least as far.
  const serverLines = useMemo(
    () =>
      getWholeHistoryLines({
        data: points,
        answerIds: serverPointAnswerIds,
        latestBetTime: serverLastBetTime,
      }),
    [points, serverPointAnswerIds, serverLastBetTime]
  )
  const lines = useMemo(
    () => withFurtherLines(serverLines, fetchedLines),
    [serverLines, fetchedLines]
  )
  const allTimePoints = useMemo(
    () => getWholeHistoryPoints(lines, live),
    [lines, live]
  )

  // The answers on the chart that have no whole-history line.
  const answerIds = useMemo(
    () => contract.answers.map((a) => a.id),
    [contract.answers]
  )
  const getUncovered = (neededIds: string[]) =>
    getUncoveredAnswerIds({ neededIds, knownIds: answerIds, lines })
  const uncoveredKey = useMemo(
    () =>
      getUncovered(
        previewedWithoutHistory === undefined
          ? graphedAnswerIds
          : [...graphedAnswerIds, previewedWithoutHistory]
      ).join(','),
    [graphedAnswerIds, previewedWithoutHistory, answerIds, lines]
  )
  const hasWholeHistory = uncoveredKey === ''

  // A previewed answer is not among the graphed ones. If it has no line, note
  // it, which is what gets one fetched.
  const onPreview = useEvent(() => {
    const id = previewStore.get()
    if (id !== undefined && getUncovered([id]).length > 0)
      setPreviewedWithoutHistory(id)
  })
  useEffect(() => previewStore.subscribe(onPreview), [previewStore])

  // The last bet the page knows of: from the contract, from its own feed and
  // from the live feed. Undefined if it knows of none. Only bets that moved a
  // probability count in the two feeds, and the contract's last bet time is
  // not moved on by an order that has not been filled.
  const knownLastBetTime = latestDefined([
    contract.lastBetTime,
    latestPageBetTime,
    latestLiveBetTime,
  ])

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
      // up to the last bet that came back with it, and the page's own up to
      // the last bet the server made it from.
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

  const fetchZoomed = useEvent(
    async (window: { min: number; max: number; reachedLastBet: boolean }) => {
      const request = ++latestZoomRequest.current
      const isLatest = () => request === latestZoomRequest.current
      setIsLoadingZoomed(true)
      try {
        const fetched = await fetchPoints(window)
        if (isLatest()) setZoomed(fetched)
      } catch (e) {
        // Leave what is on screen. The next zoom, or a reload, tries again.
        console.error('Failed to load chart points', e)
      } finally {
        if (isLatest()) setIsLoadingZoomed(false)
      }
    }
  )

  // Fetches the market's whole history up to the last bet the page knows of,
  // unless a request that will do is on its way.
  const fetchWholeHistory = useEvent(
    async (wanted: { answerIds: string[]; upTo?: number }) => {
      if (isOnItsWay(wholeHistoryRequests.current, wanted)) return
      const request: WholeHistoryRequest = {
        answerIds,
        max: (knownLastBetTime ?? createdTime) + 1,
      }
      const requestMarket = market.current
      const isSameMarket = () => requestMarket === market.current
      wholeHistoryRequests.current = [...wholeHistoryRequests.current, request]
      setWholeHistoryRequestCount(wholeHistoryRequests.current.length)
      try {
        const fetched = await fetchPoints({
          min: createdTime - FETCH_LEAD_MS,
          max: request.max,
          reachedLastBet: true,
        })
        if (isSameMarket())
          setFetchedLines((kept) =>
            withFurtherLines(kept, getWholeHistoryLines(fetched))
          )
      } catch (e) {
        // Leave what is on screen. The next time one is called for tries again.
        console.error('Failed to load chart points', e)
      } finally {
        if (isSameMarket()) {
          wholeHistoryRequests.current = wholeHistoryRequests.current.filter(
            (r) => r !== request
          )
          setWholeHistoryRequestCount(wholeHistoryRequests.current.length)
        }
      }
    }
  )

  const view = getViewWindow(viewXScale)
  const viewMin = view?.[0]
  const viewMax = view?.[1]
  // The whole-history view is what the user is looking at.
  const isWatchingWholeHistory = !!view && isShown && !isZoomed && isPageVisible

  // A whole history is fetched with the live contract: it has the market's
  // last bet, and every answer, which a fetch needs to make a line for each.
  // If the live contract has not loaded a while after the chart came on
  // screen, the fetch goes ahead with the contract there is, and is made
  // again for what that one lacked once the live one loads.
  useEffect(() => {
    if (!isWatchingWholeHistory || hasLiveContract || hasWaitedForLiveContract)
      return
    const timer = setTimeout(
      () => setHasWaitedForLiveContract(true),
      LIVE_CONTRACT_WAIT_MS
    )
    return () => clearTimeout(timer)
  }, [isWatchingWholeHistory, hasLiveContract, hasWaitedForLiveContract])
  const canFetchWholeHistory =
    isWatchingWholeHistory && (hasLiveContract || hasWaitedForLiveContract)

  // An answer on the chart has no line: fetch the whole history. Asked for
  // again only when the answers without a line change, or the user comes back
  // to the whole history or to the page.
  useEffect(() => {
    if (canFetchWholeHistory && uncoveredKey !== '')
      fetchWholeHistory({ answerIds: uncoveredKey.split(',') })
  }, [canFetchWholeHistory, uncoveredKey])

  // A line on the chart is behind the last bet the page knows of: fetch the
  // whole history again. This is checked at the moments named at the top, and
  // not when a bet arrives.
  const refreshIfBehind = useEvent(() => {
    if (
      canFetchWholeHistory &&
      isBehindLastBet({ lines, answerIds: graphedAnswerIds, knownLastBetTime })
    )
      fetchWholeHistory({ answerIds: [], upTo: knownLastBetTime })
  })
  // On screen with a contract to fetch with, the live contract loading, back
  // to the whole history, back to the page.
  useEffect(() => {
    refreshIfBehind()
  }, [canFetchWholeHistory, hasLiveContract])
  // The page's own feed turns up a bet the live feed did not deliver.
  const isMissingPageBet = hasUndeliveredBet({
    lines,
    answerIds: graphedAnswerIds,
    latestPageBetTime,
    latestLiveBetTime,
  })
  useEffect(() => {
    if (isMissingPageBet) refreshIfBehind()
  }, [isMissingPageBet])

  // A zoomed window, once the view settles. A new bet moves the last bet, but
  // its points arrive on the live feed, so it is no reason to fetch again.
  // The window is worked out when the timer fires, from the last bet known
  // then.
  const fetchZoomedView = useEvent((min: number, max: number) =>
    fetchZoomed(
      getZoomWindow({
        view: { min, max },
        createdTime,
        lastBetTime: knownLastBetTime ?? createdTime,
        leadMs: FETCH_LEAD_MS,
      })
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
    // While a whole history is fetched again for lines that are behind, they
    // stay on screen, so nothing is shown as loading.
    loading: isZoomed
      ? isLoadingZoomed
      : wholeHistoryRequestCount > 0 && !hasWholeHistory,
  }
}
