import { getAnswerProbability } from 'common/calculate'
import { MultiContract } from 'common/contract'
import { getAnswerColor } from './contract/choice'
import { sortAnswers } from 'common/answer'
import clsx from 'clsx'

/** Sparklineish stacked bar chart. Values sum to 1 */
export const MiniStackedBar = (props: {
  options: Array<{ prob: number; color: string }>
  width?: string
}) => {
  const { options, width = 'w-[3ch' } = props
  return (
    <div className={clsx('my-0.5 inline-flex h-5', width)}>
      {options.map((option, i) => (
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
  width?: string
}) => {
  const { options, width = 'w-[3ch]' } = props
  return (
    <span className="inline-flex align-top">
      <div className={clsx('grid h-5', width)}>
        {options.map((option, i) => (
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

export const ContractMinibar = (props: {
  contract: MultiContract
  width?: string
}) => {
  const { contract, width } = props
  const answers = sortAnswers(contract, contract.answers)

  const sumsToOne =
    contract.mechanism != 'cpmm-multi-1' || contract.shouldAnswersSumToOne

  const answersToShow = sumsToOne ? answers : answers.slice(0, 3)
  const options = answersToShow.map((a) => ({
    prob: getAnswerProbability(contract, a.id),
    color: getAnswerColor(
      a,
      answers.map((answer) => answer.text)
    ),
  }))

  if (sumsToOne) {
    return <MiniStackedBar width={width} options={options} />
  } else {
    return <MiniBar width={width} options={options} />
  }
}
