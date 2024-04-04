import { getAnswerProbability } from 'common/calculate'
import { MultiContract } from 'common/contract'
import { getAnswerColor } from './contract/choice'
import { sortAnswers } from 'common/answer'

/** Sparklineish stacked bar chart. Values sum to 1 */
export const MiniStackedBar = (props: {
  options: Array<{ prob: number; color: string }>
}) => {
  return (
    <div className="my-0.5 inline-flex h-5 w-[3ch]">
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

/** Sparklineish bar chart. Values are between 0-1 */
export const MiniBar = (props: {
  options: Array<{ prob: number; color: string }>
}) => {
  return (
    <span>
      <div className="my-0.5 grid h-5 w-[3ch]">
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
    </span>
  )
}

export const ContractMinibar = (props: { contract: MultiContract }) => {
  const { contract } = props
  const answers = sortAnswers(contract, contract.answers)

  const sumsToOne =
    contract.mechanism != 'cpmm-multi-1' || contract.shouldAnswersSumToOne

  const options = answers.map((a) => ({
    prob: getAnswerProbability(contract, a.id),
    color: getAnswerColor(
      a,
      answers.map((answer) => answer.text)
    ),
  }))

  if (sumsToOne) {
    return <MiniStackedBar options={options} />
  } else {
    return <MiniBar options={options.slice(0, 3)} />
  }
}
