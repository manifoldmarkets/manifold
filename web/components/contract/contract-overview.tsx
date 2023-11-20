import { ReactNode, memo, useMemo, useState } from 'react'
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
import { YES_GRAPH_COLOR } from 'common/envs/constants'
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
import { useEvent } from 'web/hooks/use-event'
import { useUser } from 'web/hooks/use-user'
import { tradingAllowed } from 'common/contract'
import { Period } from 'web/lib/firebase/users'
import { periodDurations } from 'web/lib/util/time'
import { SignedInBinaryMobileBetting } from '../bet/bet-button'
import { StonkContractChart } from '../charts/contract/stonk'
import { getDateRange, useViewScale } from '../charts/helpers'
import { TimeRangePicker } from '../charts/time-range-picker'
import { Row } from '../layout/row'
import { CertOverview } from './cert-overview'
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
import { viewScale } from 'common/chart'
import { Col } from '../layout/col'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { getAnswerProbability } from 'common/calculate'
import { searchInAny } from 'common/util/parse'

export const ContractOverview = memo(
  (props: {
    contract: Contract
    betPoints: HistoryPoint<Partial<Bet>>[] | MultiPoints
    showResolver: boolean
    resolutionRating?: ReactNode
    setShowResolver: (show: boolean) => void
    onAnswerCommentClick: (answer: Answer | DpmAnswer) => void
  }) => {
    const {
      betPoints,
      contract,
      showResolver,
      resolutionRating,
      setShowResolver,
      onAnswerCommentClick,
    } = props

    switch (contract.outcomeType) {
      case 'BINARY':
        return (
          <BinaryOverview
            betPoints={betPoints as any}
            contract={contract}
            resolutionRating={resolutionRating}
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
      case 'CERT':
        return <CertOverview contract={contract} />
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
}) => {
  const { contract, betPoints, resolutionRating } = props
  const user = useUser()

  const [showZoomer, setShowZoomer] = useState(false)

  const { viewScale, currentTimePeriod, setTimePeriod, start, maxRange } =
    useTimePicker(contract)

  return (
    <>
      <Row className="items-end justify-between gap-4">
        <Col>
          <BinaryResolutionOrChance contract={contract} />
          {resolutionRating}
        </Col>
        <TimeRangePicker
          currentTimePeriod={currentTimePeriod}
          setCurrentTimePeriod={(p) => {
            setTimePeriod(p)
            setShowZoomer(true)
          }}
          maxRange={maxRange}
          color="green"
        />
      </Row>

      <BinaryChart
        showZoomer={showZoomer}
        betPoints={betPoints}
        contract={contract}
        viewScale={viewScale}
        controlledStart={start}
      />

      {tradingAllowed(contract) && (
        <SignedInBinaryMobileBetting contract={contract} user={user} />
      )}
    </>
  )
}

export function BinaryChart(props: {
  showZoomer: boolean
  betPoints: HistoryPoint<Partial<Bet>>[]
  percentBounds?: { max: number; min: number }
  contract: BinaryContract
  viewScale: viewScale
  className?: string
  controlledStart?: number
  size?: 'sm' | 'md'
  color?: string
}) {
  const {
    showZoomer,
    betPoints,
    contract,
    percentBounds,
    viewScale,
    className,
    controlledStart,
    size = 'md',
  } = props

  return (
    <SizedContainer
      className={clsx(
        showZoomer && 'mb-8',
        ' w-full pb-3 pr-10',
        size == 'sm' ? 'h-[100px]' : 'h-[150px] sm:h-[250px]',
        className
      )}
    >
      {(w, h) => (
        <BinaryContractChart
          width={w}
          height={h}
          betPoints={betPoints}
          viewScaleProps={viewScale}
          controlledStart={controlledStart}
          percentBounds={percentBounds}
          contract={contract}
          showZoomer={showZoomer}
        />
      )}
    </SizedContainer>
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
  const { viewScale, currentTimePeriod, setTimePeriod, start, maxRange } =
    useTimePicker(contract)

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
        <TimeRangePicker
          currentTimePeriod={currentTimePeriod}
          setCurrentTimePeriod={(p) => {
            setTimePeriod(p)
            setShowZoomer(true)
          }}
          maxRange={maxRange}
          color="indigo"
        />
      </Row>
      {!!Object.keys(points).length && contract.mechanism == 'cpmm-multi-1' && (
        <SizedContainer
          className={clsx(
            'h-[150px] w-full pb-4 pr-10 sm:h-[250px]',
            showZoomer && 'mb-8'
          )}
        >
          {(w, h) => (
            <ChoiceContractChart
              showZoomer={showZoomer}
              viewScaleProps={viewScale}
              controlledStart={start}
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
            />
          )}
        </SizedContainer>
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
  const { viewScale, currentTimePeriod, setTimePeriod, start, maxRange } =
    useTimePicker(contract)
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
            viewScaleProps={viewScale}
            controlledStart={start}
            contract={contract}
            showZoomer
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
  const { viewScale, currentTimePeriod, setTimePeriod, start, maxRange } =
    useTimePicker(contract)
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
            viewScaleProps={viewScale}
            controlledStart={start}
            contract={contract}
            color={YES_GRAPH_COLOR}
          />
        )}
      </SizedContainer>

      {user && tradingAllowed(contract) && (
        <SignedInBinaryMobileBetting contract={contract} user={user} />
      )}
    </>
  )
}

export const useTimePicker = (contract: Contract) => {
  const viewScale = useViewScale()
  const [currentTimePeriod, setCurrentTimePeriod] = useState<Period>('allTime')

  //zooms out of graph if zoomed in upon time selection change
  const setTimePeriod = useEvent((timePeriod: Period) => {
    setCurrentTimePeriod(timePeriod)
    viewScale.setViewXScale(undefined)
    viewScale.setViewYScale(undefined)
  })

  const [startRange, endRange] = getDateRange(contract)
  const end = endRange ?? Date.now()

  const start =
    currentTimePeriod === 'allTime'
      ? undefined
      : end - periodDurations[currentTimePeriod]
  const maxRange = end - startRange

  return { viewScale, currentTimePeriod, setTimePeriod, start, maxRange }
}
