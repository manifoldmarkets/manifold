import { RadioGroup } from '@headlessui/react'
import clsx from 'clsx'

const colorClasses = {
  'indigo-dark':
    'text-ink-500 hover:bg-primary-100 hover:text-ink-700 aria-checked:bg-primary-500 aria-checked:text-white',
  indigo:
    'text-ink-500 hover:bg-ink-50 aria-checked:bg-primary-100 aria-checked:text-primary-900',
  green:
    'text-ink-500 hover:bg-ink-50 aria-checked:bg-teal-500 aria-checked:text-ink-0',
  red: 'text-ink-500 hover:bg-ink-50 aria-checked:bg-scarlet-500 aria-checked:text-ink-0',
  gray: 'text-ink-900 aria-checked:shadow bg-canvas-50 hover:bg-canvas-50 aria-checked:bg-canvas-0',
  'light-gray':
    'text-ink-900 aria-checked:shadow bg-canvas-50 hover:bg-canvas-50 aria-checked:bg-canvas-0',
  light:
    'text-ink-900 aria-checked:shadow bg-transparent hover:bg-canvas-50/70 aria-checked:bg-canvas-0 ',
  'light-green':
    'text-ink-900 aria-checked:shadow bg-transparent hover:bg-canvas-50/70 aria-checked:bg-teal-500/20 ',
  'light-red':
    'text-ink-900 aria-checked:shadow bg-transparent hover:bg-canvas-50/70 aria-checked:bg-scarlet-500/20 ',
}

export type ColorType = keyof typeof colorClasses

export function ChoicesToggleGroup(props: {
  currentChoice: number | string | boolean | undefined
  choicesMap: { [key: string]: string | number | boolean }
  disabled?: boolean
  disabledOptions?: Array<string | number | boolean> //values
  setChoice: (val: number | string | boolean) => void
  onSameChoiceClick?: (val: number | string | boolean) => void
  color?: ColorType
  className?: string
  toggleClassName?: string
  children?: React.ReactNode
}) {
  const {
    currentChoice,
    setChoice,
    onSameChoiceClick,
    disabled,
    disabledOptions,
    choicesMap,
    color = 'indigo-dark',
    className,
    children,
    toggleClassName,
  } = props

  const isModernStyle =
    color === 'gray' ||
    color === 'light' ||
    color === 'light-green' ||
    color === 'light-red' ||
    color === 'light-gray'

  return (
    <RadioGroup
      className={clsx(
        className,
        color === 'gray'
          ? 'bg-canvas-50 inline-flex flex-row rounded-lg p-1 text-sm'
          : color.startsWith('light')
          ? 'inline-flex flex-row rounded-lg bg-transparent p-1 text-sm'
          : 'border-ink-300 text-ink-400 bg-canvas-0 inline-flex flex-row gap-2 rounded-md border p-1 text-sm shadow-sm',
        disabled && '!cursor-not-allowed opacity-50'
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
          onClick={() => {
            if (choice === currentChoice && onSameChoiceClick) {
              onSameChoiceClick(choice)
            }
          }}
          className={({ disabled }) =>
            clsx(
              disabled
                ? 'text-ink-300 cursor-not-allowed'
                : 'cursor-pointer ' + colorClasses[color],
              isModernStyle
                ? 'ring-primary-500 my-0.5 flex items-center rounded-md px-4 py-2 outline-none transition-all focus-visible:ring-2'
                : 'ring-primary-500 flex items-center rounded-md p-2 outline-none transition-all focus-visible:ring-2 sm:px-3',
              toggleClassName
            )
          }
        >
          <RadioGroup.Label as="span">{choiceKey}</RadioGroup.Label>
        </RadioGroup.Option>
      ))}
      {children}
    </RadioGroup>
  )
}
