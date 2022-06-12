import { RadioGroup } from '@headlessui/react'
import clsx from 'clsx'
import React from 'react'

export function ChoicesToggleGroup(props: {
  currentChoice: number | string
  choicesMap: { [key: string]: string | number }
  isSubmitting?: boolean
  setChoice: (p: number | string) => void
  className?: string
  toggleClassName?: string
  children?: React.ReactNode
}) {
  const {
    currentChoice,
    setChoice,
    isSubmitting,
    choicesMap,
    className,
    children,
    toggleClassName,
  } = props
  return (
    <RadioGroup
      className={clsx(className, 'flex flex-row flex-wrap items-center gap-3')}
      value={currentChoice.toString()}
      onChange={(str) => null}
    >
      {Object.keys(choicesMap).map((choiceKey) => (
        <RadioGroup.Option
          key={choiceKey}
          value={choicesMap[choiceKey]}
          onClick={() => setChoice(choicesMap[choiceKey])}
          className={({ active }) =>
            clsx(
              active ? 'ring-2 ring-indigo-500 ring-offset-2' : '',
              currentChoice === choicesMap[choiceKey]
                ? 'border-transparent bg-indigo-500 text-white dark:text-black hover:bg-indigo-600 dark:hover:bg-indigo-400'
                : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-black text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-950',
              'flex cursor-pointer items-center justify-center rounded-md border py-3 px-3 text-sm font-medium normal-case',
              "hover:ring-offset-2' hover:ring-2 hover:ring-indigo-500",
              toggleClassName
            )
          }
          disabled={isSubmitting}
        >
          <RadioGroup.Label as="span">{choiceKey}</RadioGroup.Label>
        </RadioGroup.Option>
      ))}
      {children}
    </RadioGroup>
  )
}
