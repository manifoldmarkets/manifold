import clsx from 'clsx'
import { Answer } from 'common/answer'
import { getProbability } from 'common/calculate'
import { getValueFromBucket } from 'common/calculate-dpm'
import {
  BinaryContract,
  Contract,
  FreeResponseContract,
  MultipleChoiceContract,
  outcomeType,
  resolution,
} from 'common/contract'
import { formatLargeNumber, formatPercent } from 'common/util/format'
import { Tooltip } from './widgets/tooltip'
import { Bet } from 'common/bet'

export function OutcomeLabel(props: {
  contract: Contract
  outcome: resolution | string
  truncate: 'short' | 'long' | 'none'
  value?: number
}) {
  const { outcome, contract, truncate, value } = props
  const { outcomeType } = contract

  if (outcomeType === 'PSEUDO_NUMERIC')
    return <PseudoNumericOutcomeLabel outcome={outcome as any} />

  if (outcomeType === 'BINARY')
    return <BinaryOutcomeLabel outcome={outcome as any} />

  if (outcomeType === 'NUMERIC')
    return (
      <span className="text-blue-500">
        {value ?? getValueFromBucket(outcome, contract)}
      </span>
    )

  if (outcomeType === 'CERT' || outcomeType === 'QUADRATIC_FUNDING') {
    return <span>TODO Cert outcome label</span>
  }
  if (outcomeType === 'STONK') {
    return <span>TODO Stonk outcome label</span>
  }

  return (
    <FreeResponseOutcomeLabel
      contract={contract}
      resolution={outcome}
      truncate={truncate}
      answerClassName={'font-bold text-base-400 !break-normal'}
    />
  )
}

export function BinaryOutcomeLabel(props: { outcome: resolution }) {
  const { outcome } = props

  if (outcome === 'YES') return <YesLabel />
  if (outcome === 'NO') return <NoLabel />
  if (outcome === 'MKT') return <ProbLabel />
  return <CancelLabel />
}

export function PseudoNumericOutcomeLabel(props: { outcome: resolution }) {
  const { outcome } = props

  if (outcome === 'YES') return <HigherLabel />
  if (outcome === 'NO') return <LowerLabel />
  if (outcome === 'MKT') return <ProbLabel />
  return <CancelLabel />
}

export function BinaryContractOutcomeLabel(props: {
  contract: BinaryContract
  resolution: resolution
}) {
  const { contract, resolution } = props

  if (resolution === 'MKT') {
    const prob = contract.resolutionProbability ?? getProbability(contract)
    return <ProbPercentLabel prob={prob} />
  }

  return <BinaryOutcomeLabel outcome={resolution} />
}

export function FreeResponseOutcomeLabel(props: {
  contract: FreeResponseContract | MultipleChoiceContract
  resolution: string | 'CANCEL' | 'MKT'
  truncate: 'short' | 'long' | 'none'
  answerClassName?: string
}) {
  const { contract, resolution, truncate, answerClassName } = props

  if (resolution === 'CANCEL') return <CancelLabel />
  if (resolution === 'MKT') return <MultiLabel />

  const chosen = contract.answers?.find((answer) => answer.id === resolution)
  if (!chosen) return <AnswerNumberLabel number={resolution} />
  return (
    <AnswerLabel
      answer={chosen}
      truncate={truncate}
      className={answerClassName}
    />
  )
}

export function YesLabel() {
  return <span className="text-teal-600">YES</span>
}

export function HigherLabel() {
  return <span className="text-teal-600">HIGHER</span>
}

export function LowerLabel() {
  return <span className="text-scarlet-600">LOWER</span>
}

export function NoLabel() {
  return <span className="text-scarlet-600">NO</span>
}

export function CancelLabel() {
  return <span className="text-yellow-600">N/A</span>
}

export function ProbLabel() {
  return <span className="text-sky-600">PROB</span>
}

export function MultiLabel() {
  return <span className="text-sky-600">MANY</span>
}

export function ProbPercentLabel(props: { prob: number }) {
  const { prob } = props
  return <span className="text-sky-600">{formatPercent(prob)}</span>
}

export function NumericValueLabel(props: { value: number }) {
  const { value } = props
  return <span className="text-sky-600">{formatLargeNumber(value)}</span>
}

export function AnswerNumberLabel(props: { number: string }) {
  return <span className="text-teal-600">#{props.number}</span>
}

export function AnswerLabel(props: {
  answer: Answer
  truncate: 'short' | 'medium' | 'long' | 'none'
  className?: string
}) {
  const { answer, truncate, className } = props
  const { text } = answer
  const ELLIPSES_LENGTH = 3

  let truncated = text
  const truncatedLength =
    truncate === 'short'
      ? 20
      : truncated === 'medium'
      ? 30
      : truncated === 'long'
      ? 75
      : undefined

  if (truncatedLength && text.length > truncatedLength + ELLIPSES_LENGTH) {
    truncated = text.slice(0, truncatedLength) + '...'
  }

  return (
    <Tooltip text={truncated === text ? false : text}>
      <span className={clsx('break-anywhere', className)}>{truncated}</span>
    </Tooltip>
  )
}

export function BetOutcomeLabel(props: {
  contractOutcomeType: outcomeType
  bet: Bet
  answerText?: string
}) {
  const { contractOutcomeType, bet, answerText } = props
  if (contractOutcomeType === 'BINARY') {
    return <BinaryOutcomeLabel outcome={bet.outcome as resolution} />
  }
  if (contractOutcomeType === 'PSEUDO_NUMERIC') {
    return <PseudoNumericOutcomeLabel outcome={bet.outcome as resolution} />
  }
  if (
    contractOutcomeType === 'FREE_RESPONSE' ||
    contractOutcomeType === 'MULTIPLE_CHOICE'
  ) {
    return (
      <span className={clsx('text-primary-700')}>
        {answerText ?? bet.outcome}
      </span>
    )
  }
  return <span className={'text-primary-700'}>{bet.outcome}</span>
}
