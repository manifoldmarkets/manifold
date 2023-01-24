import { RadioGroup } from '@headlessui/react'
import clsx from 'clsx'
import React from 'react'

export function ChoicesToggleGroup(props: {
  currentChoice: number | string
  choicesMap: { [key: string]: string | number }
  disabled?: boolean
  setChoice: (p: number | string) => void
  className?: string
  toggleClassName?: string
  children?: React.ReactNode
}) {
  const {
    currentChoice,
    setChoice,
    disabled,
    choicesMap,
    className,
    children,
    toggleClassName,
  } = props
  return (
    <RadioGroup
      className={clsx(
        className,
        'flex flex-row gap-2 rounded-md border border-gray-300 bg-white p-1 text-sm text-gray-900 shadow-sm',
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
          className={({ disabled }) =>
            clsx(
              disabled
                ? 'aria-checked:bg-gray-300 cursor-not-allowed text-gray-500'
                : 'aria-checked:bg-indigo-500 aria-checked:text-white cursor-pointer hover:bg-indigo-50',
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
