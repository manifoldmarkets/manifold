import { getAnswerProbability, getTopNSortedAnswers } from 'common/calculate'
import { MultiContract } from 'common/contract'
import { getAnswerColor } from './contract/choice'

/** Sparklineish bar chart. Input: array of nums that sum < 1 */
export const Minibar = (props: {
  options: Array<{ prob: number; color: string }>
}) => {
  return (
    <div className="bg-ink-200 my-0.5 inline-flex h-5 w-[34px]">
      {props.options.map((option, i) => (
        <span
          key={i}
          style={{
            width: option.prob * 100 + '%',
            backgroundColor: option.color,
          }}
        />
      ))}
    </div>
  )
}

export const ContractMinibar = (props: { contract: MultiContract }) => {
  const { contract } = props
  const answers = getTopNSortedAnswers(contract, 10)
  const options = answers.map((a) => ({
    prob: getAnswerProbability(contract, a.id),
    color: getAnswerColor(
      a,
      answers.map((answer) => answer.text)
    ),
  }))

  return <Minibar options={options} />
}
