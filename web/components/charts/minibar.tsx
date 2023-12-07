import { getAnswerProbability, getTopNSortedAnswers } from 'common/calculate'
import { MultiContract } from 'common/contract'
import { nthColor } from './contract/choice'
import clsx from 'clsx'

/** Sparklineish bar chart. Input: array of nums that sum < 1 */
export const Minibar = (props: { probs: number[]; className?: string }) => {
  const { className } = props
  return (
    <div
      className={clsx('bg-ink-200 my-0.5 inline-flex h-5 w-[34px]', className)}
    >
      {props.probs.map((p, i) => (
        <span
          key={i}
          style={{
            width: p * 100 + '%',
            backgroundColor: nthColor(i),
          }}
        />
      ))}
    </div>
  )
}

export const ContractMinibar = (props: {
  contract: MultiContract
  className?: string
}) => {
  const { contract, className } = props
  const answers = getTopNSortedAnswers(contract, 10)
  const probs = answers.map((a) => getAnswerProbability(contract, a.id))
  return <Minibar probs={probs} className={className} />
}
