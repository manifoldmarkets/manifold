import { ReactNode, memo, useMemo, useState, useEffect, useRef } from 'react'
import clsx from 'clsx'
import { sortBy } from 'lodash'

import { Bet } from 'common/bet'
import { HistoryPoint } from 'common/chart'
import {
  BinaryContract,
  CPMMStonkContract,
  Contract,
  MultiContract,
  NumericContract,
  PseudoNumericContract,
} from 'common/contract'
import { NumericContractChart } from '../charts/contract/numeric'
import { BinaryContractChart } from '../charts/contract/binary'
import { ChoiceContractChart, MultiPoints } from '../charts/contract/choice'
import { PseudoNumericContractChart } from '../charts/contract/pseudo-numeric'
import {
  BinaryResolutionOrChance,
  NumericResolutionOrExpectation,
  PseudoNumericResolutionOrExpectation,
  StonkPrice,
} from 'web/components/contract/contract-price'
import { SizedContainer } from 'web/components/sized-container'
import { useUser } from 'web/hooks/use-user'
import { tradingAllowed } from 'common/contract'
import { Period } from 'web/lib/firebase/users'
import { periodDurations } from 'web/lib/util/time'
import { SignedInBinaryMobileBetting } from '../bet/bet-button'
import { StonkContractChart } from '../charts/contract/stonk'
import { ZoomParams, getEndDate, useZoom, PointerMode } from '../charts/helpers'
import { TimeRangePicker } from '../charts/time-range-picker'
import { Row } from '../layout/row'
import { QfOverview } from './qf-overview'
import { AnswersPanel } from '../answers/answers-panel'
import { Answer, DpmAnswer } from 'common/answer'
import { UserBetsSummary } from '../bet/bet-summary'
import {
  AnswersResolvePanel,
  IndependentAnswersResolvePanel,
} from '../answers/answer-resolve-panel'
import { CancelLabel } from '../outcome-label'
import { PollPanel } from '../poll/poll-panel'
import { Col } from '../layout/col'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { getAnswerProbability } from 'common/calculate'
import { searchInAny } from 'common/util/parse'
import { useAnnotateChartTools } from 'web/hooks/use-chart-annotations'
import {
  ControlledCarousel,
  useCarousel,
} from 'web/components/widgets/carousel'
import { ReadChartAnnotationModal } from 'web/components/annotate-chart'
import { UserLink } from 'web/components/widgets/user-link'
import { Button } from 'web/components/buttons/button'
import toast from 'react-hot-toast'
import { TbPencilPlus } from 'react-icons/tb'
import { ChartAnnotation } from 'common/supabase/chart-annotations'
import { useEvent } from 'web/hooks/use-event'
import { Avatar } from 'web/components/widgets/avatar'

export const ContractOverview = memo(
  (props: {
    contract: Contract
    betPoints: HistoryPoint<Partial<Bet>>[] | MultiPoints
    showResolver: boolean
    resolutionRating?: ReactNode
    setShowResolver: (show: boolean) => void
    onAnswerCommentClick: (answer: Answer | DpmAnswer) => void
    chartAnnotations: ChartAnnotation[]
  }) => {
    const {
      betPoints,
      contract,
      showResolver,
      resolutionRating,
      setShowResolver,
      onAnswerCommentClick,
      chartAnnotations,
    } = props

    switch (contract.outcomeType) {
      case 'BINARY':
        return (
          <BinaryOverview
            betPoints={betPoints as any}
            contract={contract}
            resolutionRating={resolutionRating}
            chartAnnotations={chartAnnotations}
          />
        )
      case 'NUMERIC':
        return (
          <NumericOverview
            contract={contract}
            resolutionRating={resolutionRating}
          />
        )
      case 'PSEUDO_NUMERIC':
        return (
          <PseudoNumericOverview
            contract={contract}
            betPoints={betPoints as any}
            resolutionRating={resolutionRating}
          />
        )

      case 'QUADRATIC_FUNDING':
        return <QfOverview contract={contract} />
      case 'FREE_RESPONSE':
      case 'MULTIPLE_CHOICE':
        return (
          <ChoiceOverview
            contract={contract}
            points={betPoints as any}
            showResolver={showResolver}
            setShowResolver={setShowResolver}
            resolutionRating={resolutionRating}
            onAnswerCommentClick={onAnswerCommentClick}
            chartAnnotations={chartAnnotations}
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
        return <>Deprecated</>
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
  const { contract, betPoints, resolutionRating } = props
  const user = useUser()

  const [showZoomer, setShowZoomer] = useState(false)
  const { currentTimePeriod, setTimePeriod, maxRange, zoomParams } =
    useTimePicker(contract, () => setShowZoomer(true))
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
            color="green"
          />
        </Row>
      </Row>

      <BinaryChart
        showZoomer={showZoomer}
        showAnnotations={true}
        zoomParams={zoomParams}
        betPoints={betPoints}
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
    <SizedContainer
      className={clsx(
        showZoomer && !showAnnotations
          ? 'mb-12'
          : showAnnotations && showZoomer
          ? 'mb-28'
          : showAnnotations && (chartAnnotations?.length ?? 0) > 0
          ? 'mb-16'
          : '',
        'w-full pb-3 pr-10',
        size == 'sm' ? 'h-[100px]' : 'h-[150px] sm:h-[250px]',
        className
      )}
    >
      {(w, h) => (
        <>
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
          {showAnnotations && chartAnnotations?.length && (
            <ChartAnnotations
              annotations={chartAnnotations}
              hoveredAnnotation={hoveredAnnotation}
              setHoveredAnnotation={setHoveredAnnotation}
              showZoomer={showZoomer}
            />
          )}
        </>
      )}
    </SizedContainer>
  )
}
const ChartAnnotations = (props: {
  annotations: ChartAnnotation[]
  hoveredAnnotation?: number | null
  setHoveredAnnotation?: (id: number | null) => void
  showZoomer?: boolean
}) => {
  const { annotations, hoveredAnnotation, setHoveredAnnotation, showZoomer } =
    props
  const [carouselRef, setCarouselRef] = useState<HTMLDivElement | null>(null)
  const { onScroll, scrollLeft, scrollRight, atFront, atBack } =
    useCarousel(carouselRef)

  return (
    <ControlledCarousel
      className={clsx(
        'relative',
        showZoomer ? 'mt-12' : 'mt-6',
        'max-w-full gap-1'
      )}
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
    user_id,
    user_username,
    user_name,
  } = annotation
  const [open, setOpen] = useState(false)
  const { creator_username, event_time, creator_id, creator_name } = annotation
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
        'cursor-pointer rounded-md border-2 p-2',
        hovered ? 'border-indigo-600' : ''
      )}
      ref={ref}
      onMouseOver={() => setHoveredAnnotation?.(id)}
      onMouseLeave={() => setHoveredAnnotation?.(null)}
      onClick={() => setOpen(true)}
    >
      <Col className={'w-[175px] gap-1'}>
        <Row className={'items-center justify-between'}>
          <Avatar
            avatarUrl={user_avatar_url ?? creator_avatar_url}
            username={user_username ?? creator_username}
            noLink={true}
            size={'2xs'}
            className={'mr-1'}
          />
          <UserLink
            noLink={true}
            user={{
              id: user_id ?? creator_id,
              username: user_username ?? creator_username,
              name: user_name ?? creator_name,
            }}
            hideBadge={true}
            className={'grow truncate text-xs'}
          />
          <span className={'text-ink-500 shrink-0 text-xs'}>
            {new Date(event_time).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </Row>
        <div className="line-clamp-1 text-sm">{text}</div>
      </Col>
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

export type MultiSort = 'prob-desc' | 'prob-asc' | 'old' | 'new' | 'liquidity'

const MAX_DEFAULT_GRAPHED_ANSWERS = 6
const MAX_DEFAULT_ANSWERS = 20

const ChoiceOverview = (props: {
  points: MultiPoints
  contract: MultiContract
  showResolver: boolean
  resolutionRating?: ReactNode
  setShowResolver: (show: boolean) => void
  onAnswerCommentClick: (answer: Answer | DpmAnswer) => void
  chartAnnotations: ChartAnnotation[]
}) => {
  const {
    points,
    contract,
    showResolver,
    resolutionRating,
    setShowResolver,
    onAnswerCommentClick,
  } = props

  const [showZoomer, setShowZoomer] = useState(false)
  const { currentTimePeriod, setTimePeriod, maxRange, zoomParams } =
    useTimePicker(contract, () => setShowZoomer(true))

  const [hoverAnswerId, setHoverAnswerId] = useState<string>()
  const [checkedAnswerIds, setCheckedAnswerIds] = useState<string[]>([])

  const shouldAnswersSumToOne =
    'shouldAnswersSumToOne' in contract ? contract.shouldAnswersSumToOne : true

  const { resolutions, outcomeType } = contract
  const isMultipleChoice = outcomeType === 'MULTIPLE_CHOICE'
  const addAnswersMode =
    'addAnswersMode' in contract
      ? contract.addAnswersMode
      : outcomeType === 'FREE_RESPONSE'
      ? 'ANYONE'
      : 'DISABLED'
  const [query, setQuery] = usePersistentInMemoryState(
    '',
    'create-answer-text' + contract.id
  )

  const answers = contract.answers
    .filter((a) => isMultipleChoice || ('number' in a && a.number !== 0))
    .map((a) => ({
      ...a,
      prob: getAnswerProbability(contract, a.id),
    }))

  const [sort, setSort] = usePersistentInMemoryState<MultiSort>(
    addAnswersMode === 'DISABLED'
      ? 'old'
      : !shouldAnswersSumToOne
      ? 'prob-desc'
      : answers.length > 10
      ? 'prob-desc'
      : 'old',
    'answer-sort' + contract.id
  )

  const [showAll, setShowAll] = useState(
    addAnswersMode === 'DISABLED' || answers.length <= 5
  )

  const sortedAnswers = useMemo(
    () =>
      sortBy(answers, [
        shouldAnswersSumToOne
          ? // Winners first
            (answer) => (resolutions ? -1 * resolutions[answer.id] : answer)
          : // Resolved last
            (answer) =>
              'resolutionTime' in answer ? answer.resolutionTime ?? 1 : 0,
        // then by sort
        (answer) => {
          if (sort === 'old') {
            return 'index' in answer ? answer.index : answer.number
          } else if (sort === 'new') {
            return 'index' in answer ? -answer.index : -answer.number
          } else if (sort === 'prob-asc') {
            return answer.prob
          } else if (sort === 'prob-desc') {
            return -1 * answer.prob
          } else if (sort === 'liquidity') {
            return 'subsidyPool' in answer ? -answer.subsidyPool : 0
          }
        },
      ]),
    [answers, resolutions, shouldAnswersSumToOne, sort]
  )

  const {
    pointerMode,
    setPointerMode,
    hoveredAnnotation,
    setHoveredAnnotation,
    chartAnnotations,
    enableAdd,
  } = useAnnotateChartTools(contract, props.chartAnnotations)

  const searchedAnswers = useMemo(() => {
    if (!answers.length || !query) return []

    return sortedAnswers.filter(
      (answer) =>
        checkedAnswerIds.includes(answer.id) || searchInAny(query, answer.text)
    )
  }, [sortedAnswers, query])

  const answersToShow = query
    ? searchedAnswers
    : showAll
    ? sortedAnswers
    : sortedAnswers
        .filter((answer) => {
          if (checkedAnswerIds.includes(answer.id)) {
            return true
          }

          if (resolutions?.[answer.id]) {
            return true
          }
          if (sort === 'prob-asc') {
            return answer.prob < 0.99
          } else if (sort === 'prob-desc') {
            return answer.prob > 0.01
          } else if (sort === 'liquidity' || sort === 'new' || sort === 'old') {
            return !('resolution' in answer)
          }
        })
        .slice(0, MAX_DEFAULT_ANSWERS)
  return (
    <>
      <Row className="justify-between gap-2">
        {contract.resolution === 'CANCEL' ? (
          <div className="flex items-end gap-2 text-2xl sm:text-3xl">
            <span className="text-base">Resolved</span>
            <CancelLabel />
          </div>
        ) : (
          <div />
        )}
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
            color="indigo"
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
              selectedAnswerIds={
                checkedAnswerIds.length
                  ? checkedAnswerIds
                  : answersToShow
                      .map((a) => a.id)
                      .slice(0, MAX_DEFAULT_GRAPHED_ANSWERS)
              }
              pointerMode={pointerMode}
              setHoveredAnnotation={setHoveredAnnotation}
              hoveredAnnotation={hoveredAnnotation}
              chartAnnotations={chartAnnotations}
            />
          )}
        </SizedContainer>
      )}
      {chartAnnotations?.length && (
        <ChartAnnotations
          annotations={chartAnnotations}
          hoveredAnnotation={hoveredAnnotation}
          setHoveredAnnotation={setHoveredAnnotation}
          showZoomer={showZoomer}
        />
      )}
      {showResolver ? (
        !shouldAnswersSumToOne && contract.mechanism === 'cpmm-multi-1' ? (
          <IndependentAnswersResolvePanel contract={contract} />
        ) : (
          <AnswersResolvePanel
            contract={contract}
            onClose={() => setShowResolver(false)}
          />
        )
      ) : (
        <>
          {resolutionRating}
          <AnswersPanel
            contract={contract}
            onAnswerCommentClick={onAnswerCommentClick}
            onAnswerHover={(ans) => setHoverAnswerId(ans?.id)}
            onAnswerClick={({ id }) =>
              setCheckedAnswerIds((answers) =>
                answers.includes(id)
                  ? answers.filter((a) => a !== id)
                  : [...answers, id]
              )
            }
            sort={sort}
            setSort={setSort}
            query={query}
            setQuery={setQuery}
            setShowAll={setShowAll}
            answersToShow={answersToShow}
            selected={checkedAnswerIds}
          />
          <UserBetsSummary
            className="border-ink-200 !mb-2 mt-2 "
            contract={contract}
          />
        </>
      )}
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
          color="indigo"
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
          color="green"
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
