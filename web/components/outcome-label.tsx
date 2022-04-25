import clsx from 'clsx'
import { Answer } from '../../common/answer'
import { getProbability } from '../../common/calculate'
import {
  Binary,
  Contract,
  CPMM,
  DPM,
  FreeResponse,
  FreeResponseContract,
  FullContract,
} from '../../common/contract'
import { formatPercent } from '../../common/util/format'

export function OutcomeLabel(props: {
  contract: Contract
  outcome: 'YES' | 'NO' | 'CANCEL' | 'MKT' | string
  truncate: 'short' | 'long' | 'none'
}) {
  const { outcome, contract, truncate } = props

  if (contract.outcomeType === 'BINARY')
    return <BinaryOutcomeLabel outcome={outcome as any} />

  return (
    <FreeResponseOutcomeLabel
      contract={contract as FullContract<DPM, FreeResponse>}
      resolution={outcome}
      truncate={truncate}
      answerClassName={'font-bold text-primary'}
    />
  )
}

export function BinaryOutcomeLabel(props: {
  outcome: 'YES' | 'NO' | 'CANCEL' | 'MKT'
}) {
  const { outcome } = props

  if (outcome === 'YES') return <YesLabel />
  if (outcome === 'NO') return <NoLabel />
  if (outcome === 'MKT') return <ProbLabel />
  return <CancelLabel />
}

export function BinaryContractOutcomeLabel(props: {
  contract: FullContract<DPM | CPMM, Binary>
  resolution: 'YES' | 'NO' | 'CANCEL' | 'MKT'
}) {
  const { contract, resolution } = props

  if (resolution === 'MKT') {
    const prob = contract.resolutionProbability ?? getProbability(contract)
    return <ProbPercentLabel prob={prob} />
  }

  return <BinaryOutcomeLabel outcome={resolution} />
}

export function FreeResponseOutcomeLabel(props: {
  contract: FreeResponseContract
  resolution: string | 'CANCEL' | 'MKT'
  truncate: 'short' | 'long' | 'none'
  answerClassName?: string
}) {
  const { contract, resolution, truncate, answerClassName } = props

  if (resolution === 'CANCEL') return <CancelLabel />
  if (resolution === 'MKT') return <MultiLabel />

  const { answers } = contract
  const chosen = answers?.find((answer) => answer.id === resolution)
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
  return <span className="text-primary">YES</span>
}

export function NoLabel() {
  return <span className="text-red-400">NO</span>
}

export function CancelLabel() {
  return <span className="text-yellow-400">N/A</span>
}

export function ProbLabel() {
  return <span className="text-blue-400">PROB</span>
}

export function MultiLabel() {
  return <span className="text-blue-400">MULTI</span>
}

export function ProbPercentLabel(props: { prob: number }) {
  const { prob } = props
  return <span className="text-blue-400">{formatPercent(prob)}</span>
}

export function AnswerNumberLabel(props: { number: string }) {
  return <span className="text-primary">#{props.number}</span>
}

export function AnswerLabel(props: {
  answer: Answer
  truncate: 'short' | 'long' | 'none'
  className?: string
}) {
  const { answer, truncate, className } = props
  const { text } = answer

  let truncated = text
  if (truncate === 'short' && text.length > 20) {
    truncated = text.slice(0, 10) + '...' + text.slice(-10)
  } else if (truncate === 'long' && text.length > 75) {
    truncated = text.slice(0, 75) + '...'
  }

  return <span className={className}>{truncated}</span>
}
