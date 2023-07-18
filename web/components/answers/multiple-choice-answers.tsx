import { MAX_ANSWERS, MAX_ANSWER_LENGTH } from 'common/answer'
import { XIcon } from '@heroicons/react/solid'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { ExpandingInput } from '../widgets/expanding-input'

export function MultipleChoiceAnswers(props: {
  answers: string[]
  setAnswers: (answers: string[]) => void
  placeholder?: string
}) {
  const { answers, setAnswers, placeholder } = props
  console.log(answers)

  const setAnswer = (i: number, answer: string) => {
    const newAnswers = setElement(answers, i, answer)
    setAnswers(newAnswers)
  }

  const removeAnswer = (i: number) => {
    const newAnswers = answers.slice(0, i).concat(answers.slice(i + 1))
    setAnswers(newAnswers)
  }

  const addAnswer = () => setAnswer(answers.length, '')

  return (
    <Col>
      {answers.map((answer, i) => (
        <Row className="mb-2 items-center gap-2 align-middle" key={i}>
          {i + 1}.{' '}
          <ExpandingInput
            value={answer}
            onChange={(e) => setAnswer(i, e.target.value)}
            className="ml-2 w-full"
            placeholder={placeholder ?? `Option ${i + 1}`}
            rows={1}
            maxLength={MAX_ANSWER_LENGTH}
          />
          {answers.length > 2 && (
            <button
              onClick={() => removeAnswer(i)}
              type="button"
              className="hover:bg-canvas-50 border-ink-300 text-ink-700 bg-canvas-0 focus:ring-primary-500 inline-flex items-center rounded-full border p-1 text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
            >
              <XIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </Row>
      ))}

      {answers.length < MAX_ANSWERS && (
        <Row className="justify-end">
          <button
            type="button"
            onClick={addAnswer}
            className="hover:bg-canvas-50 border-ink-300 text-ink-700 bg-canvas-0 focus:ring-primary-500 inline-flex items-center rounded border px-2.5 py-1.5 text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
          >
            Add answer
          </button>
        </Row>
      )}
    </Col>
  )
}

const setElement = <T,>(array: T[], i: number, elem: T) => {
  const newArray = array.concat()
  newArray[i] = elem
  return newArray
}
