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
                ? 'border-transparent bg-indigo-500 text-white hover:bg-indigo-600'
                : 'border-gray-200 bg-white text-gray-900 hover:bg-gray-50',
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
