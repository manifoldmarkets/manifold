import { ReactNode, memo, useState } from 'react'
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
import { ChoiceContractChart, MultiPoint } from '../charts/contract/choice'
import { PseudoNumericContractChart } from '../charts/contract/pseudo-numeric'
import { useViewScale } from 'web/components/charts/generic-charts'
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
import { getDateRange } from '../charts/helpers'
import { TimeRangePicker } from '../charts/time-range-picker'
import { Row } from '../layout/row'
import { CertOverview } from './cert-overview'
import { QfOverview } from './qf-overview'
import { AnswersPanel } from '../answers/answers-panel'
import { Answer, DpmAnswer } from 'common/answer'
import { UserBetsSummary } from '../bet/bet-summary'
import { AnswersResolvePanel } from '../answers/answer-resolve-panel'
import { CancelLabel } from '../outcome-label'
import { PollPanel } from '../poll/poll-panel'
import { CreateAnswerPanel } from '../answers/create-answer-panel'
import clsx from 'clsx'
import { viewScale } from 'common/chart'
import { Col } from '../layout/col'

export const ContractOverview = memo(
  (props: {
    contract: Contract
    betPoints: HistoryPoint<Partial<Bet>>[] | MultiPoint[]
    showResolver: boolean
    onAnswerCommentClick?: (answer: Answer | DpmAnswer) => void
    resolutionRating?: ReactNode
  }) => {
    const {
      betPoints,
      contract,
      showResolver,
      onAnswerCommentClick,
      resolutionRating,
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
            onAnswerCommentClick={onAnswerCommentClick}
            resolutionRating={resolutionRating}
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

const ChoiceOverview = (props: {
  points: MultiPoint[]
  contract: MultiContract
  showResolver: boolean
  onAnswerCommentClick?: (answer: Answer | DpmAnswer) => void
  resolutionRating?: ReactNode
}) => {
  const {
    points,
    contract,
    showResolver,
    onAnswerCommentClick,
    resolutionRating,
  } = props

  if (!onAnswerCommentClick) return null
  return (
    <>
      {contract.resolution === 'CANCEL' && (
        <div className="flex items-end gap-2 text-2xl sm:text-3xl">
          <span className="text-base">Resolved</span>
          <CancelLabel />
        </div>
      )}
      {!!points.length && (
        <SizedContainer className="h-[150px] w-full pb-4 pr-10 sm:h-[250px]">
          {(w, h) => (
            <ChoiceContractChart
              width={w}
              height={h}
              points={points}
              contract={contract}
            />
          )}
        </SizedContainer>
      )}

      {showResolver ? (
        <AnswersResolvePanel contract={contract} />
      ) : (
        <>
          {resolutionRating}
          <AnswersPanel
            contract={contract}
            onAnswerCommentClick={onAnswerCommentClick}
          />
          <CreateAnswerPanel contract={contract} />
          <UserBetsSummary
            className="border-ink-200 mt-2 !mb-2 "
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
