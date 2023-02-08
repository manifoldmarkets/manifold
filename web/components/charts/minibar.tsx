import { getOutcomeProbability, getTopNSortedAnswers } from 'common/calculate'
import { FreeResponseContract, MultipleChoiceContract } from 'common/contract'
import { CHOICE_ANSWER_COLORS } from './contract/choice'

/** Sparklineish bar chart. Input: array of nums that sum < 1 */
export const Minibar = (props: { probs: number[] }) => {
  return (
    <div className="my-0.5 flex h-5 w-full bg-gray-200">
      {props.probs.map((p, i) => (
        <span
          style={{
            width: p * 100 + '%',
            backgroundColor: CHOICE_ANSWER_COLORS[i],
          }}
        />
      ))}
    </div>
  )
}

export const ContractMinibar = (props: {
  contract: FreeResponseContract | MultipleChoiceContract
}) => {
  const { contract } = props
  const answers = getTopNSortedAnswers(contract, 5)
  return (
    <Minibar
      probs={answers.map((a) => getOutcomeProbability(contract, a.id))}
    />
  )
}
