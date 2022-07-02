import clsx from 'clsx'
import { ReactNode } from 'react'
import { Answer } from 'common/answer'
import { getProbability } from 'common/calculate'
import { getValueFromBucket } from 'common/calculate-dpm'
import {
  BinaryContract,
  Contract,
  FreeResponseContract,
  resolution,
} from 'common/contract'
import { formatPercent } from 'common/util/format'
import { ClientRender } from './client-render'

export function OutcomeLabel(props: {
  contract: Contract
  outcome: resolution | string
  truncate: 'short' | 'long' | 'none'
  value?: number
}) {
  const { outcome, contract, truncate, value } = props

  if (contract.outcomeType === 'BINARY')
    return <BinaryOutcomeLabel outcome={outcome as any} />

  if (contract.outcomeType === 'NUMERIC')
    return (
      <span className="text-blue-500">
        {value ?? getValueFromBucket(outcome, contract)}
      </span>
    )

  return (
    <FreeResponseOutcomeLabel
      contract={contract}
      resolution={outcome}
      truncate={truncate}
      answerClassName={'font-bold text-base-400'}
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
  contract: FreeResponseContract
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
    <FreeResponseAnswerToolTip text={chosen.text}>
      <AnswerLabel
        answer={chosen}
        truncate={truncate}
        className={answerClassName}
      />
    </FreeResponseAnswerToolTip>
  )
}

export const OUTCOME_TO_COLOR = {
  YES: 'primary',
  NO: 'red-400',
  CANCEL: 'yellow-400',
  MKT: 'blue-400',
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
  return <span className="text-blue-400">MANY</span>
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

  return (
    <span
      style={{ wordBreak: 'break-word' }}
      className={clsx('whitespace-pre-line break-words', className)}
    >
      {truncated}
    </span>
  )
}

function FreeResponseAnswerToolTip(props: {
  text: string
  children?: ReactNode
}) {
  const { text } = props
  return (
    <>
      <ClientRender>
        <span
          className="tooltip hidden cursor-default sm:inline-block"
          data-tip={text}
        >
          {props.children}
        </span>
      </ClientRender>
      <span className="whitespace-nowrap sm:hidden">{props.children}</span>
    </>
  )
}
