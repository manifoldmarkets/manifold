import { Row } from './layout/row'
import clsx from 'clsx'

export function ChoicesToggleGroup(props: {
  currentChoice: number
  setChoice: (p: number) => void
  choices: number[]
  titles: string[]
  isSubmitting?: boolean
}) {
  const { currentChoice, setChoice, titles, choices, isSubmitting } = props
  const baseButtonClassName = 'btn btn-outline btn-md sm:btn-md normal-case'
  const activeClasss =
    'bg-indigo-600 focus:bg-indigo-600 hover:bg-indigo-600 text-white'
  return (
    <Row className={'mt-2 items-center gap-2'}>
      <div className={'btn-group justify-stretch'}>
        {choices.map((choice, i) => {
          return (
            <button
              key={choice + i + ''}
              disabled={isSubmitting}
              className={clsx(
                baseButtonClassName,
                currentChoice === choice ? activeClasss : ''
              )}
              onClick={() => setChoice(choice)}
            >
              {titles[i]}
            </button>
          )
        })}
      </div>
    </Row>
  )
}
