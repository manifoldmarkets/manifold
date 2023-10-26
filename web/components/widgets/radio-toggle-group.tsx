import { RadioGroup } from '@headlessui/react'
import clsx from 'clsx'
import { orderBy } from 'lodash'
import { Col } from '../layout/col'
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

  const items = Object.entries(choicesMap)
  const keys = Object.keys(choicesMap)

  return (
    <Row className="text-ink-700 items-center text-sm">
      {keys[0]}
      <RadioGroup
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${items.length}, 1fr)`,
          gridGap: '10px',
        }}
        className={clsx(
          className,
          `text-ink-400 w-full rounded-md p-1 text-xs shadow-sm`
        )}
        value={currentChoice}
        onChange={setChoice}
      >
        {orderBy(Object.entries(choicesMap), ([_, choice]) => choice).map(
          ([choiceKey, choice], index) => (
            <RadioGroup.Option
              key={choiceKey}
              value={choice}
              className={({ disabled }) =>
                clsx(
                  disabled
                    ? 'text-ink-300  cursor-not-allowed'
                    : 'cursor-pointer ',
                  'mx-auto h-5 w-5 rounded-full border bg-opacity-60 transition-all focus-visible:ring-2',
                  'aria-checked:border-transparent aria-checked:bg-opacity-100 aria-checked:ring-8 aria-checked:ring-opacity-50',
                  `${
                    MultipleChoiceColors[index % MultipleChoiceColors.length]
                  }`,
                  toggleClassName
                )
              }
              // style={{
              //   backgroundColor: `${
              //     MultipleChoiceColors[index % MultipleChoiceColors.length]
              //   }`,
              //   borderColor:
              //     MultipleChoiceColors[index % MultipleChoiceColors.length],
              // }}
            />
          )
        )}
      </RadioGroup>
      {keys[keys.length - 1]}
    </Row>
  )
}
