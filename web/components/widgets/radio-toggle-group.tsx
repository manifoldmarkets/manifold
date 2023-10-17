import { RadioGroup } from '@headlessui/react'
import clsx from 'clsx'
import { orderBy } from 'lodash'

export function RadioToggleGroup(props: {
  currentChoice: number
  choicesMap: Record<string, number>
  setChoice: (p: number) => void
  className?: string
  toggleClassName?: string
}) {
  const { currentChoice, setChoice, choicesMap, className, toggleClassName } =
    props
  return (
    <RadioGroup
      className={clsx(
        className,
        'border-ink-300 text-ink-400 bg-canvas-0  gap-2 rounded-md border p-1 text-sm shadow-sm'
      )}
      value={currentChoice}
      onChange={setChoice}
    >
      {orderBy(Object.entries(choicesMap), ([_, choice]) => choice).map(
        ([choiceKey, choice]) => (
          <RadioGroup.Option
            key={choiceKey}
            value={choice}
            className={({ disabled }) =>
              clsx(
                disabled
                  ? 'text-ink-300  cursor-not-allowed'
                  : 'cursor-pointer ',
                'text-ink-500 hover:bg-primary-100 hover:text-ink-700 aria-checked:bg-primary-500 aria-checked:text-white',
                ' rounded-md p-2 outline-none transition-all focus-visible:ring-2 sm:px-3',
                toggleClassName
              )
            }
          >
            <RadioGroup.Label as="span">{choiceKey}</RadioGroup.Label>
          </RadioGroup.Option>
        )
      )}
    </RadioGroup>
  )
}
