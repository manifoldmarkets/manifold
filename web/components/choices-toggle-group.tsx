import { Row } from './layout/row'
import { RadioGroup } from '@headlessui/react'
import clsx from 'clsx'

export function ChoicesToggleGroup(props: {
  currentChoice: number | string
  choicesMap: { [key: string]: string | number }
  isSubmitting?: boolean
  setChoice: (p: number | string) => void
  className?: string
}) {
  const { currentChoice, setChoice, isSubmitting, choicesMap, className } =
    props
  return (
    <Row className={'mt-2 items-center gap-2'}>
      <RadioGroup
        value={currentChoice.toString()}
        onChange={(str) => null}
        className="mt-2"
      >
        <div className={`grid grid-cols-12 gap-3`}>
          {Object.keys(choicesMap).map((choiceKey) => (
            <RadioGroup.Option
              key={choiceKey}
              value={choicesMap[choiceKey]}
              onClick={() => setChoice(choicesMap[choiceKey])}
              className={({ active }) =>
                clsx(
                  active ? 'ring-2 ring-indigo-500 ring-offset-2' : '',
                  currentChoice === choicesMap[choiceKey]
                    ? 'border-transparent bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'border-gray-200 bg-white text-gray-900 hover:bg-gray-50',
                  'flex cursor-pointer items-center justify-center rounded-md border py-3 px-3 text-sm font-medium normal-case',
                  "hover:ring-offset-2' hover:ring-2 hover:ring-indigo-500",
                  className
                )
              }
              disabled={isSubmitting}
            >
              <RadioGroup.Label as="span">{choiceKey}</RadioGroup.Label>
            </RadioGroup.Option>
          ))}
        </div>
      </RadioGroup>
    </Row>
  )
}
