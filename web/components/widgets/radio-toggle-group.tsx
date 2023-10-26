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
          `flex w-full flex-row justify-between gap-2 rounded-md p-1 text-xs shadow-sm`
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
                  ? 'bg-rose-500 ring-rose-500'
                  : index % MultipleChoiceColors.length == 1
                  ? 'bg-rose-300 ring-rose-300'
                  : index % MultipleChoiceColors.length == 2
                  ? 'bg-stone-300 ring-stone-300'
                  : index % MultipleChoiceColors.length == 3
                  ? 'bg-teal-300 ring-teal-300'
                  : 'bg-teal-500 ring-teal-500',

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
