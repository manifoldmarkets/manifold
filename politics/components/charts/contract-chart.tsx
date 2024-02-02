import clsx from 'clsx'
import { ReactNode, memo, useEffect, useMemo, useRef, useState } from 'react'

import { Bet } from 'common/bet'
import {
  HistoryPoint,
  MultiSerializedPoints,
  SerializedPoint,
  unserializeMultiPoints,
  unserializePoints,
} from 'common/chart'
import {
  BinaryContract,
  CPMMStonkContract,
  Contract,
  MultiContract,
  NumericContract,
  PseudoNumericContract,
  tradingAllowed,
} from 'common/contract'
import { ChartAnnotation } from 'common/supabase/chart-annotations'
import { formatPercent } from 'common/util/format'
import { first, mergeWith } from 'lodash'
import toast from 'react-hot-toast'
import { FaArrowTrendDown, FaArrowTrendUp } from 'react-icons/fa6'
import { TbPencilPlus } from 'react-icons/tb'
import { ReadChartAnnotationModal } from 'web/components/annotate-chart'
import { SignedInBinaryMobileBetting } from 'web/components/bet/bet-button'
import { Button } from 'web/components/buttons/button'
import { BinaryContractChart } from 'web/components/charts/contract/binary'
import {
  MultiPoints,
  getMultiBetPoints,
} from 'web/components/charts/contract/choice'
import { NumericContractChart } from 'web/components/charts/contract/numeric'
import { PseudoNumericContractChart } from 'web/components/charts/contract/pseudo-numeric'
import { StonkContractChart } from 'web/components/charts/contract/stonk'
import { useDataZoomFetcher } from 'web/components/charts/contract/zoom-utils'
import {
  BinaryResolutionOrChance,
  NumericResolutionOrExpectation,
  PseudoNumericResolutionOrExpectation,
  StonkPrice,
} from 'web/components/contract/contract-price'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { PollPanel } from 'web/components/poll/poll-panel'
import { SizedContainer } from 'web/components/sized-container'
import { AlertBox } from 'web/components/widgets/alert-box'
import { Avatar } from 'web/components/widgets/avatar'
import {
  ControlledCarousel,
  useCarousel,
} from 'web/components/widgets/carousel'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useRealtimeBets } from 'web/hooks/use-bets-supabase'
import { useAnnotateChartTools } from 'web/hooks/use-chart-annotations'
import { useEvent } from 'web/hooks/use-event'
import { useUser } from 'web/hooks/use-user'
import { Period } from 'web/lib/firebase/users'
import { periodDurations } from 'web/lib/util/time'
import { ChoiceContractChart } from '../charts/contract/choice'
import { PointerMode, ZoomParams, getEndDate, useZoom } from '../charts/helpers'
import { TimeRangePicker } from '../charts/time-range-picker'

export const ContractChart = memo(
  (props: {
    contract: Contract
    historyData: {
      bets: Bet[]
      points: MultiSerializedPoints | SerializedPoint<Partial<Bet>>[]
    }
    chartAnnotations: ChartAnnotation[]
    shownAnswers?: string[]
  }) => {
    const { contract, historyData, chartAnnotations, shownAnswers } = props

    // Static props load bets in descending order by time
    const lastBetTime = first(historyData.bets)?.createdTime

    const { rows, loadNewer } = useRealtimeBets({
      contractId: contract.id,
      afterTime: lastBetTime,
      filterRedemptions: contract.outcomeType !== 'MULTIPLE_CHOICE',
      order: 'asc',
    })

    useEffect(() => {
      loadNewer()
    }, [contract.volume])

    const newBets = rows ?? []

    const betPoints = useMemo(() => {
      if (
        contract.outcomeType === 'MULTIPLE_CHOICE' ||
        contract.outcomeType === 'FREE_RESPONSE'
      ) {
        const data = unserializeMultiPoints(
          historyData.points as MultiSerializedPoints
        )
        const newData =
          contract.mechanism === 'cpmm-multi-1'
            ? getMultiBetPoints(newBets)
            : []

        return mergeWith(data, newData, (a, b) => [...(a ?? []), ...(b ?? [])])
      } else {
        const points = unserializePoints(historyData.points as any)
        const newPoints = newBets.map((bet) => ({
          x: bet.createdTime,
          y: bet.probAfter,
          obj: { userAvatarUrl: bet.userAvatarUrl },
        }))
        return [...points, ...newPoints]
      }
    }, [historyData.points, newBets])

    switch (contract.outcomeType) {
      case 'BINARY':
        return (
          <BinaryOverview
            betPoints={betPoints as any}
            contract={contract}
            chartAnnotations={chartAnnotations}
          />
        )
      case 'NUMERIC':
        return <NumericOverview contract={contract} />
      case 'PSEUDO_NUMERIC':
        return (
          <PseudoNumericOverview
            contract={contract}
            betPoints={betPoints as any}
          />
        )

      case 'QUADRATIC_FUNDING':
        return <AlertBox title="Quadratic Funding markets are deprecated" />
      case 'FREE_RESPONSE':
      case 'MULTIPLE_CHOICE':
        return (
          <ChoiceChart
            contract={contract}
            points={betPoints as any}
            chartAnnotations={chartAnnotations}
            shownAnswers={shownAnswers}
          />
        )
      case 'STONK':
        return (
          <StonkOverview contract={contract} betPoints={betPoints as any} />
        )
      case 'BOUNTIED_QUESTION':
        return <></>
      case 'POLL':
        return <PollPanel contract={contract} />
      case 'CERT':
        return <AlertBox title="Certs are deprecated" />
    }
  }
)

const NumericOverview = (props: {
  contract: NumericContract
  resolutionRating?: ReactNode
}) => {
  const { contract, resolutionRating } = props
  return (
    <>
      <NumericResolutionOrExpectation contract={contract} />
      {resolutionRating}
      <SizedContainer className="h-[150px] w-full pb-4 pr-10 sm:h-[250px]">
        {(w, h) => (
          <NumericContractChart width={w} height={h} contract={contract} />
        )}
      </SizedContainer>
    </>
  )
}

export const BinaryOverview = (props: {
  contract: BinaryContract
  betPoints: HistoryPoint<Partial<Bet>>[]
  resolutionRating?: ReactNode
  chartAnnotations: ChartAnnotation[]
}) => {
  const { contract, resolutionRating } = props

  const user = useUser()

  const [showZoomer, setShowZoomer] = useState(false)
  const { currentTimePeriod, setTimePeriod, maxRange, zoomParams } =
    useTimePicker(contract, () => setShowZoomer(true))

  const { points, loading } = useDataZoomFetcher({
    contractId: contract.id,
    viewXScale: zoomParams?.viewXScale,
    points: props.betPoints,
  })

  const {
    pointerMode,
    setPointerMode,
    hoveredAnnotation,
    setHoveredAnnotation,
    chartAnnotations,
    enableAdd,
  } = useAnnotateChartTools(contract, props.chartAnnotations)

  return (
    <>
      <Row className="items-end justify-between gap-4">
        <Col>
          <BinaryResolutionOrChance contract={contract} />
          {resolutionRating}
        </Col>
        <Row className={'gap-1'}>
          {!loading && <LoadingIndicator size="sm" />}
          {enableAdd && (
            <EditChartAnnotationsButton
              pointerMode={pointerMode}
              setPointerMode={setPointerMode}
            />
          )}
          <TimeRangePicker
            currentTimePeriod={currentTimePeriod}
            setCurrentTimePeriod={setTimePeriod}
            maxRange={maxRange}
          />
        </Row>
      </Row>

      <BinaryChart
        showZoomer={showZoomer}
        showAnnotations={true}
        zoomParams={zoomParams}
        betPoints={points}
        contract={contract}
        hoveredAnnotation={hoveredAnnotation}
        setHoveredAnnotation={setHoveredAnnotation}
        pointerMode={pointerMode}
        chartAnnotations={chartAnnotations}
      />

      {tradingAllowed(contract) && (
        <SignedInBinaryMobileBetting contract={contract} user={user} />
      )}
    </>
  )
}

const EditChartAnnotationsButton = (props: {
  pointerMode: PointerMode
  setPointerMode: (mode: PointerMode) => void
}) => {
  const { pointerMode, setPointerMode } = props
  return (
    <Button
      color={pointerMode === 'annotate' ? 'yellow' : 'gray-white'}
      onClick={() => {
        setPointerMode(pointerMode === 'annotate' ? 'zoom' : 'annotate')
        if (pointerMode !== 'annotate')
          toast('Click on the chart to add an annotation.', {
            icon: <TbPencilPlus className={'h-5 w-5 text-green-500'} />,
          })
      }}
      size={'xs'}
    >
      <TbPencilPlus className={clsx('h-[1.2rem] w-[1.2rem]')} />
    </Button>
  )
}

export function BinaryChart(props: {
  showZoomer?: boolean
  zoomParams?: ZoomParams
  showAnnotations?: boolean
  betPoints: HistoryPoint<Partial<Bet>>[]
  percentBounds?: { max: number; min: number }
  contract: BinaryContract
  className?: string
  size?: 'sm' | 'md'
  color?: string
  hoveredAnnotation?: number | null
  setHoveredAnnotation?: (id: number | null) => void
  pointerMode?: PointerMode
  chartAnnotations?: ChartAnnotation[]
}) {
  const {
    showZoomer,
    zoomParams,
    showAnnotations,
    betPoints,
    contract,
    percentBounds,
    className,
    size = 'md',
    pointerMode,
    setHoveredAnnotation,
    hoveredAnnotation,
    chartAnnotations,
  } = props

  return (
    <>
      <SizedContainer
        className={clsx(
          showZoomer ? 'mb-12' : '',
          'w-full pb-3 pr-10',
          size == 'sm' ? 'h-[100px]' : 'h-[150px] sm:h-[250px]',
          className
        )}
      >
        {(w, h) => (
          <BinaryContractChart
            width={w}
            height={h}
            betPoints={betPoints}
            showZoomer={showZoomer}
            zoomParams={zoomParams}
            percentBounds={percentBounds}
            contract={contract}
            hoveredAnnotation={hoveredAnnotation}
            setHoveredAnnotation={setHoveredAnnotation}
            pointerMode={pointerMode}
            chartAnnotations={chartAnnotations}
          />
        )}
      </SizedContainer>
      {showAnnotations && chartAnnotations?.length ? (
        <ChartAnnotations
          annotations={chartAnnotations}
          hoveredAnnotation={hoveredAnnotation}
          setHoveredAnnotation={setHoveredAnnotation}
        />
      ) : null}
    </>
  )
}
const ChartAnnotations = (props: {
  annotations: ChartAnnotation[]
  hoveredAnnotation?: number | null
  setHoveredAnnotation?: (id: number | null) => void
}) => {
  const { annotations, hoveredAnnotation, setHoveredAnnotation } = props
  const [carouselRef, setCarouselRef] = useState<HTMLDivElement | null>(null)
  const { onScroll, scrollLeft, scrollRight, atFront, atBack } =
    useCarousel(carouselRef)

  return (
    <ControlledCarousel
      className={clsx('relative', 'max-w-full gap-1')}
      ref={setCarouselRef}
      onScroll={onScroll}
      scrollLeft={scrollLeft}
      scrollRight={scrollRight}
      atFront={atFront}
      atBack={atBack}
    >
      {annotations.map((a) => (
        <ChartAnnotation
          key={a.id}
          annotation={a}
          hovered={a.id === hoveredAnnotation}
          setHoveredAnnotation={setHoveredAnnotation}
          carouselRef={carouselRef}
        />
      ))}
    </ControlledCarousel>
  )
}

const ChartAnnotation = (props: {
  annotation: ChartAnnotation
  hovered: boolean
  setHoveredAnnotation?: (id: number | null) => void
  carouselRef: HTMLDivElement | null
}) => {
  const { annotation, hovered, carouselRef, setHoveredAnnotation } = props
  const {
    text,
    user_avatar_url,
    creator_avatar_url,
    id,
    prob_change,
    creator_username,
    event_time,
    user_username,
  } = annotation
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const scrollIntoView = useEvent(() => {
    const card = ref.current
    if (!hovered || !carouselRef || !card) return

    const cardLeft = card.offsetLeft
    const cardWidth = card.offsetWidth
    const carouselScrollLeft = carouselRef.scrollLeft
    const carouselWidth = carouselRef.offsetWidth

    const cardRight = cardLeft + cardWidth
    const scrollRight = carouselScrollLeft + carouselWidth

    if (cardLeft < carouselScrollLeft) {
      carouselRef.scroll({ left: cardLeft, behavior: 'smooth' })
    } else if (cardRight > scrollRight) {
      carouselRef.scroll({
        left: cardRight - carouselWidth,
        behavior: 'smooth',
      })
    }
  })

  useEffect(() => {
    if (hovered) scrollIntoView()
  }, [hovered])

  return (
    <Col
      className={clsx(
        'cursor-pointer rounded-md border-2',
        hovered ? 'border-indigo-600' : 'dark:border-ink-500 border-ink-200'
      )}
      ref={ref}
      onMouseOver={() => setHoveredAnnotation?.(id)}
      onMouseLeave={() => setHoveredAnnotation?.(null)}
      onClick={() => setOpen(true)}
    >
      <div className={'relative w-[175px] p-1'}>
        <div className={'h-16 overflow-hidden p-1 text-sm'}>
          <Avatar
            avatarUrl={user_avatar_url ?? creator_avatar_url}
            username={user_username ?? creator_username}
            noLink={true}
            size={'2xs'}
            className={'float-left mr-1 mt-0.5'}
          />
          <span className={'break-anywhere text-sm'}>{text}</span>
        </div>
        <div
          className={clsx(
            'bg-canvas-0 absolute bottom-[0.15rem] right-[0.15rem] justify-end rounded-sm py-0.5',
            prob_change !== null ? 'pl-2 pr-1' : 'px-1'
          )}
        >
          <Row className={'text-ink-500 items-center'}>
            {prob_change !== null && (
              <Row className={'gap-1 text-xs'}>
                <Row
                  className={clsx(
                    'items-center gap-1',
                    prob_change > 0 ? 'text-green-500' : 'text-red-500'
                  )}
                >
                  {prob_change > 0 ? (
                    <FaArrowTrendUp className={'h-3.5 w-3.5'} />
                  ) : (
                    <FaArrowTrendDown className={'h-3.5 w-3.5'} />
                  )}
                  {prob_change > 0 ? '+' : ''}
                  {formatPercent(prob_change)}
                </Row>{' '}
                on
              </Row>
            )}
            <span className={'ml-1 shrink-0 text-xs'}>
              {new Date(event_time).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </span>
          </Row>
        </div>
      </div>
      {open && (
        <ReadChartAnnotationModal
          open={open}
          setOpen={setOpen}
          chartAnnotation={annotation}
        />
      )}
    </Col>
  )
}

export const ChoiceChart = (props: {
  points: MultiPoints
  contract: MultiContract
  chartAnnotations: ChartAnnotation[]
  shownAnswers?: string[]
}) => {
  const { points, contract } = props

  const [showZoomer, setShowZoomer] = useState(false)
  const { currentTimePeriod, setTimePeriod, maxRange, zoomParams } =
    useTimePicker(contract, () => setShowZoomer(true))

  const [hoverAnswerId, setHoverAnswerId] = useState<string>()

  const {
    pointerMode,
    setPointerMode,
    hoveredAnnotation,
    setHoveredAnnotation,
    chartAnnotations,
    enableAdd,
  } = useAnnotateChartTools(contract, props.chartAnnotations)

  const shownAnswers = props.shownAnswers ?? contract.answers.map((a) => a.id)

  return (
    <>
      <Row className="justify-between gap-2">
        <Row className={'gap-1'}>
          {enableAdd && (
            <EditChartAnnotationsButton
              pointerMode={pointerMode}
              setPointerMode={setPointerMode}
            />
          )}
          <TimeRangePicker
            currentTimePeriod={currentTimePeriod}
            setCurrentTimePeriod={setTimePeriod}
            maxRange={maxRange}
          />
        </Row>
      </Row>
      {!!Object.keys(points).length && contract.mechanism == 'cpmm-multi-1' && (
        <SizedContainer
          className={clsx(
            'h-[150px] w-full pb-4 pr-10 sm:h-[250px]',
            showZoomer && 'mb-12'
          )}
        >
          {(w, h) => (
            <ChoiceContractChart
              showZoomer={showZoomer}
              zoomParams={zoomParams}
              width={w}
              height={h}
              multiPoints={points}
              contract={contract}
              highlightAnswerId={hoverAnswerId}
              selectedAnswerIds={shownAnswers}
              pointerMode={pointerMode}
              setHoveredAnnotation={setHoveredAnnotation}
              hoveredAnnotation={hoveredAnnotation}
              chartAnnotations={chartAnnotations}
            />
          )}
        </SizedContainer>
      )}
      {chartAnnotations?.length ? (
        <ChartAnnotations
          annotations={chartAnnotations}
          hoveredAnnotation={hoveredAnnotation}
          setHoveredAnnotation={setHoveredAnnotation}
        />
      ) : null}
    </>
  )
}

const PseudoNumericOverview = (props: {
  contract: PseudoNumericContract
  betPoints: HistoryPoint<Partial<Bet>>[]
  resolutionRating?: ReactNode
}) => {
  const { contract, betPoints, resolutionRating } = props
  const [showZoomer, setShowZoomer] = useState(false)
  const { currentTimePeriod, setTimePeriod, maxRange, zoomParams } =
    useTimePicker(contract, () => setShowZoomer(true))
  const user = useUser()

  return (
    <>
      <Row className="items-end justify-between gap-4">
        <Col>
          <PseudoNumericResolutionOrExpectation contract={contract} />
          {resolutionRating}
        </Col>
        <TimeRangePicker
          currentTimePeriod={currentTimePeriod}
          setCurrentTimePeriod={setTimePeriod}
          maxRange={maxRange}
        />
      </Row>
      <SizedContainer className="mb-8 h-[150px] w-full pb-4 pr-10 sm:h-[250px]">
        {(w, h) => (
          <PseudoNumericContractChart
            width={w}
            height={h}
            betPoints={betPoints}
            zoomParams={zoomParams}
            contract={contract}
            showZoomer={showZoomer}
          />
        )}
      </SizedContainer>

      {user && tradingAllowed(contract) && (
        <SignedInBinaryMobileBetting contract={contract} user={user} />
      )}
    </>
  )
}

const StonkOverview = (props: {
  contract: CPMMStonkContract
  betPoints: HistoryPoint<Partial<Bet>>[]
}) => {
  const { contract, betPoints } = props
  const [showZoomer, setShowZoomer] = useState(false)
  const { currentTimePeriod, setTimePeriod, maxRange, zoomParams } =
    useTimePicker(contract, () => setShowZoomer(true))
  const user = useUser()

  return (
    <>
      <Row className="items-end justify-between gap-4">
        <StonkPrice contract={contract} />
        <TimeRangePicker
          currentTimePeriod={currentTimePeriod}
          setCurrentTimePeriod={setTimePeriod}
          maxRange={maxRange}
        />
      </Row>
      <SizedContainer className="h-[150px] w-full pb-4 pr-10 sm:h-[250px]">
        {(w, h) => (
          <StonkContractChart
            width={w}
            height={h}
            betPoints={betPoints}
            zoomParams={zoomParams}
            showZoomer={showZoomer}
            contract={contract}
          />
        )}
      </SizedContainer>

      {user && tradingAllowed(contract) && (
        <SignedInBinaryMobileBetting contract={contract} user={user} />
      )}
    </>
  )
}

export const useTimePicker = (contract: Contract, onRescale?: () => void) => {
  const [currentTimePeriod, setCurrentTimePeriod] = useState<Period | 'custom'>(
    'allTime'
  )

  const start = contract.createdTime
  const endRange = getEndDate(contract)
  const end = endRange ?? Date.now()
  const maxRange = end - start

  const zoomParams = useZoom((scale) => {
    onRescale?.()
    if (scale) {
      setCurrentTimePeriod('custom')
    } else {
      setCurrentTimePeriod('allTime')
    }
  })

  const setTimePeriod = (period: Period) => {
    if (period === 'allTime') {
      zoomParams.rescale(null)
    } else {
      const time = periodDurations[period]
      const start = end - time
      zoomParams.rescaleBetween(start, end)
    }

    setCurrentTimePeriod(period)
  }

  return { currentTimePeriod, setTimePeriod, maxRange, zoomParams }
}
