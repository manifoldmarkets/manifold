import { getAnswerProbability, getTopNSortedAnswers } from 'common/calculate'
import { MultiContract } from 'common/contract'
import { nthColor } from './contract/choice'

/** Sparklineish bar chart. Input: array of nums that sum < 1 */
export const Minibar = (props: { probs: number[] }) => {
  return (
    <div className="bg-ink-200 my-0.5 inline-flex h-5 w-[34px]">
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

export const ContractMinibar = (props: { contract: MultiContract }) => {
  const { contract } = props
  const answers = getTopNSortedAnswers(contract, 5)
  const probs = answers.map((a) => getAnswerProbability(contract, a.id))
  return <Minibar probs={probs} />
}
