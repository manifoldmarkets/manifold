import { RadioGroup } from '@headlessui/react'
import clsx from 'clsx'
import { orderBy } from 'lodash'
import { Row } from '../layout/row'
import { MultipleChoiceColors } from 'common/love/multiple-choice'

export function RadioToggleGroup(props: {
  currentChoice: number
  choicesMap: Record<string, number>
  setChoice: (p: number) => void
  className?: string
  toggleClassName?: string
}) {
  const { currentChoice, setChoice, choicesMap, className, toggleClassName } =
    props

  const orderedChoicesMap = orderBy(
    Object.entries(choicesMap),
    ([_, choice]) => choice
  )

  const length = orderedChoicesMap.length
  return (
    <Row className="text-ink-300 dark:text-ink-600 mb-6 items-center gap-3 text-sm">
      {orderedChoicesMap[0][0]}
      <RadioGroup
        className={clsx(
          className,
          `flex w-full flex-row justify-between gap-2 rounded-md p-1 text-xs`
        )}
        value={currentChoice}
        onChange={setChoice}
      >
        {orderedChoicesMap.map(([choiceKey, choice], index) => (
          <RadioGroup.Option
            key={choiceKey}
            value={choice}
            className={({ disabled }) =>
              clsx(
                disabled ? 'cursor-not-allowed' : 'cursor-pointer ',
                ' mx-auto h-5 w-5 rounded-full  bg-opacity-20 ring-1 ring-opacity-70 transition-all',
                ' aria-checked:bg-opacity-100 aria-checked:ring-8 aria-checked:ring-opacity-40',
                disabled
                  ? 'bg-ink-400 ring-ink-400'
                  : index % MultipleChoiceColors.length == 0
                  ? `${MultipleChoiceColors[0]} ring-rose-600`
                  : index % MultipleChoiceColors.length == 1
                  ? `${MultipleChoiceColors[1]} ring-rose-400`
                  : index % MultipleChoiceColors.length == 2
                  ? `${MultipleChoiceColors[2]} ring-stone-400`
                  : index % MultipleChoiceColors.length == 3
                  ? `${MultipleChoiceColors[3]} ring-teal-400`
                  : `${MultipleChoiceColors[4]} ring-teal-600`,

                toggleClassName
              )
            }
          />
        ))}
      </RadioGroup>
      {orderedChoicesMap[length - 1][0]}
    </Row>
  )
}
