import { XIcon } from '@heroicons/react/solid'

import { MAX_ANSWERS, MAX_ANSWER_LENGTH } from 'common/answer'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { ExpandingInput } from '../widgets/expanding-input'
import ShortToggle from '../widgets/short-toggle'
import { InfoTooltip } from '../widgets/info-tooltip'
import { OutcomeType } from 'common/contract'

export function MultipleChoiceAnswers(props: {
  answers: string[]
  setAnswers: (answers: string[]) => void
  includeOtherAnswer: boolean
  setIncludeOtherAnswer: ((include: boolean) => void) | undefined
  outcomeType: OutcomeType
  placeholder?: string
}) {
  const {
    answers,
    setAnswers,
    includeOtherAnswer,
    setIncludeOtherAnswer,
    outcomeType,
    placeholder,
  } = props

  const setAnswer = (i: number, answer: string) => {
    const newAnswers = setElement(answers, i, answer)
    setAnswers(newAnswers)
  }

  const removeAnswer = (i: number) => {
    const newAnswers = answers.slice(0, i).concat(answers.slice(i + 1))
    setAnswers(newAnswers)
  }

  const addAnswer = () => setAnswer(answers.length, '')

  const numAnswers = answers.length + (includeOtherAnswer ? 1 : 0)

  return (
    <Col className="gap-2">
      {setIncludeOtherAnswer && (
        <Row className="mb-4 items-center gap-2">
          <ShortToggle on={includeOtherAnswer} setOn={setIncludeOtherAnswer} />
          <div
            className="cursor-pointer"
            onClick={() => setIncludeOtherAnswer(!includeOtherAnswer)}
          >
            Allow yourself to add new answers later
          </div>
          <div>
            <InfoTooltip
              text={
                'If enabled, you will be able to add new answers after question creation, and an "Other" answer will be included.'
              }
            />
          </div>
        </Row>
      )}
      {answers.slice(0, answers.length).map((answer, i) => (
        <Row className="items-center gap-2 align-middle" key={i}>
          {i + 1}.{' '}
          <ExpandingInput
            value={answer}
            onChange={(e) => setAnswer(i, e.target.value)}
            className="ml-2 w-full"
            placeholder={placeholder ?? `Option ${i + 1}`}
            rows={1}
            maxLength={MAX_ANSWER_LENGTH}
          />
          {(setIncludeOtherAnswer == undefined ||
            numAnswers > 2 ||
            (numAnswers > 1 && includeOtherAnswer)) && (
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

      {includeOtherAnswer && (
        <Row className="items-center gap-2">
          {answers.length + 1}.{' '}
          <ExpandingInput
            disabled={true}
            value={'Other'}
            className="ml-2 w-full"
            rows={1}
            maxLength={MAX_ANSWER_LENGTH}
          />
          <div className="mx-1.5">
            <InfoTooltip
              text={
                'The "Other" answer represents all answers that are not listed. New answers are split off from it.'
              }
            />
          </div>
        </Row>
      )}
      {outcomeType === 'FREE_RESPONSE' && (
        <div className="text-primary-500 ml-1 mb-2 text-sm">
          Users can submit their own answers to this question.
        </div>
      )}
      {numAnswers < MAX_ANSWERS && (
        <Row className="justify-end">
          <button
            type="button"
            onClick={addAnswer}
            className="hover:bg-canvas-50 border-ink-300 text-ink-700 bg-canvas-0 focus:ring-primary-500 inline-flex items-center rounded border px-2.5 py-1.5 text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
          >
            Add {outcomeType == 'POLL' ? 'option' : 'answer'}
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
