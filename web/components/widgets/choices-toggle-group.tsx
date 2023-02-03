import { RadioGroup } from '@headlessui/react'
import clsx from 'clsx'
import React from 'react'

const colorClasses = {
  'indigo-dark':
    'text-gray-900 hover:bg-indigo-50 aria-checked:bg-indigo-500 aria-checked:text-white',
  indigo:
    'hover:bg-gray-100 aria-checked:bg-indigo-100 aria-checked:text-indigo-500',
  green:
    'hover:bg-gray-100 aria-checked:bg-teal-500/30 aria-checked:text-teal-600',
  red: 'hover:bg-gray-100 aria-checked:bg-scarlet-100 aria-checked:text-scarlet-600',
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
        'flex flex-row gap-2 rounded-md border border-gray-300 bg-white p-1 text-sm text-gray-400 shadow-sm',
        disabled && '!cursor-not-allowed bg-gray-50'
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
                ? 'cursor-not-allowed text-gray-300 aria-checked:bg-gray-300 aria-checked:text-white'
                : 'cursor-pointer ' + colorClasses[color],
              'flex items-center rounded-md p-2 outline-none ring-indigo-500 transition-all focus-visible:ring-2 sm:px-3',
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
