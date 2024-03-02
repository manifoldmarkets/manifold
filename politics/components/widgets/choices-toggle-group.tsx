import { RadioGroup } from '@headlessui/react'
import clsx from 'clsx'

export function ChoicesToggleGroup(props: {
  currentChoice: number | string | boolean
  choicesMap: { [key: string]: string | number | boolean }
  disabled?: boolean
  disabledOptions?: Array<string | number | boolean> //values
  setChoice: (val: number | string | boolean) => void
  className?: string
  toggleClassName?: string
  children?: React.ReactNode
}) {
  const {
    currentChoice,
    setChoice,
    disabled,
    disabledOptions,
    choicesMap,
    className,
    children,
    toggleClassName,
  } = props
  return (
    <RadioGroup
      className={clsx(
        className,
        'border-ink-1000 bg-canvas-0 inline-flex flex-row border text-sm ',
        disabled && 'bg-canvas-50 !cursor-not-allowed'
      )}
      value={currentChoice}
      onChange={setChoice}
      disabled={disabled}
    >
      {Object.entries(choicesMap).map(([choiceKey, choice]) => (
        <RadioGroup.Option
          key={choiceKey}
          value={choice}
          disabled={disabledOptions?.includes(choice)}
          className={({ disabled }) =>
            clsx(
              disabled
                ? 'text-ink-200 aria-checked:bg-ink-200 aria-checked:text-ink-0 cursor-not-allowed'
                : 'cursor-pointer ' +
                    'text-ink-500 hover:bg-ink-500 hover:text-ink-0 aria-checked:bg-ink-1000 aria-checked:text-white',
              'ring-primary-500 flex items-center outline-none transition-all focus-visible:ring-2 ',
              toggleClassName
            )
          }
        >
          <RadioGroup.Label className="px-1" as="span">
            {choiceKey}
          </RadioGroup.Label>
        </RadioGroup.Option>
      ))}
      {children}
    </RadioGroup>
  )
}
