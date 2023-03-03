import { RadioGroup } from '@headlessui/react'
import clsx from 'clsx'
import React from 'react'

const colorClasses = {
  'indigo-dark':
    'text-ink-900 hover:bg-primary-50 aria-checked:bg-primary-500 aria-checked:text-white',
  indigo:
    'hover:bg-ink-100 aria-checked:bg-primary-100 aria-checked:text-primary-500',
  green:
    'hover:bg-ink-100 aria-checked:bg-teal-500/30 aria-checked:text-teal-600',
  red: 'hover:bg-ink-100 aria-checked:bg-scarlet-100 aria-checked:text-scarlet-600',
}

export type ColorType = keyof typeof colorClasses

export function ChoicesToggleGroup(props: {
  currentChoice: number | string
  choicesMap: { [key: string]: string | number }
  disabled?: boolean
  disabledOptions?: Array<string | number> //values
  setChoice: (p: number | string) => void
  color?: ColorType
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
    color = 'indigo-dark',
    className,
    children,
    toggleClassName,
  } = props
  return (
    <RadioGroup
      className={clsx(
        className,
        'border-ink-300 text-ink-400 bg-canvas-0 inline-flex flex-row gap-2 rounded-md border p-1 text-sm shadow-sm',
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
                ? 'text-ink-300 aria-checked:bg-ink-300 aria-checked:text-ink-0 cursor-not-allowed'
                : 'cursor-pointer ' + colorClasses[color],
              'ring-primary-500 flex items-center rounded-md p-2 outline-none transition-all focus-visible:ring-2 sm:px-3',
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
