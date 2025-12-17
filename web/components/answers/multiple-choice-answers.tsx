import { XIcon } from '@heroicons/react/solid'
import { MAX_ANSWERS, MAX_ANSWER_LENGTH } from 'common/answer'
import { formatMoney } from 'common/util/format'
import { last } from 'lodash'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { POLL_SEE_RESULTS_ANSWER as seeResultsAnswer } from './answer-constants'
import { ChoicesToggleGroup } from '../widgets/choices-toggle-group'
import { ExpandingInput } from '../widgets/expanding-input'
import { InfoTooltip } from '../widgets/info-tooltip'

export function MultipleChoiceAnswers(props: {
  answers: string[]
  setAnswers: (answers: string[]) => void
  addAnswersMode: 'DISABLED' | 'ONLY_CREATOR' | 'ANYONE'
  setAddAnswersMode: (mode: 'DISABLED' | 'ONLY_CREATOR' | 'ANYONE') => void
  shouldAnswersSumToOne: boolean
  outcomeType: 'POLL' | 'MULTIPLE_CHOICE'
  placeholder?: string
  question: string
  generateAnswers: () => void
  isGeneratingAnswers: boolean
  marginalCost: number
}) {
  const {
    answers,
    setAnswers,
    addAnswersMode,
    setAddAnswersMode,
    shouldAnswersSumToOne,
    outcomeType,
    placeholder,
    question,
    generateAnswers,
    isGeneratingAnswers,
    marginalCost,
  } = props

  const setAnswer = (i: number, answer: string) => {
    const newAnswers = setElement(answers, i, answer)
    setAnswers(newAnswers)
  }

  const removeAnswer = (i: number) => {
    if (canRemoveAnswers) {
      const newAnswers = answers.slice(0, i).concat(answers.slice(i + 1))
      setAnswers(newAnswers)
    }
  }

  const addAnswer = () => {
    const lastAnswer = last(answers)
    if (
      outcomeType === 'POLL' &&
      lastAnswer?.toLowerCase() === seeResultsAnswer.toLowerCase()
    ) {
      const newAnswers = [
        ...answers.slice(0, answers.length - 1),
        '',
        lastAnswer,
      ]
      setAnswers(newAnswers)
    } else {
      setAnswer(answers.length, '')
    }
  }

  const focusAnswer = (i: number) => {
    const input = document.getElementById(`answer-input-${i}`)
    input?.focus()
  }
  const focusPrevAnswer = (i: number) => focusAnswer(i == 0 ? 0 : i - 1)
  const focusNextAnswer = (i: number) => {
    if (i == answers.length - 1) {
      addAnswer()
      setTimeout(() => focusAnswer(i + 1), 0) // focus after react removes the answer
    } else {
      focusAnswer(i + 1)
    }
  }

  const hasOther =
    shouldAnswersSumToOne &&
    addAnswersMode !== 'DISABLED' &&
    outcomeType !== 'POLL'

  const numAnswers = answers.length + (hasOther ? 1 : 0)

  const canRemoveAnswers =
    outcomeType === 'POLL'
      ? numAnswers > 2
      : numAnswers > 2 || (numAnswers > 1 && addAnswersMode !== 'DISABLED')

  return (
    <Col className="gap-2">
      {answers.slice(0, answers.length).map((answer, i) => (
        <Row className="items-center gap-2 align-middle sm:flex-row" key={i}>
          <span className="text-ink-600 shrink-0 text-sm sm:text-base">
            {i + 1}.
          </span>
          <div className="relative w-full">
            <AnswerInput
              id={`answer-input-${i}`}
              value={answer}
              onChange={(e) => setAnswer(i, e.target.value)}
              onUp={() => focusPrevAnswer(i)}
              onDown={() => focusNextAnswer(i)}
              onDelete={() => removeAnswer(i)}
              placeholder={placeholder ?? `Option ${i + 1}`}
            />
            {canRemoveAnswers && (
              <button
                onClick={() => removeAnswer(i)}
                type="button"
                className="hover:bg-canvas-50 border-ink-300 text-ink-700 bg-canvas-0 focus:ring-primary-500 absolute -right-1 -top-1 inline-flex items-center rounded-full border p-0.5 text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 sm:static sm:p-1"
              >
                <XIcon className="h-3 w-3 sm:h-5 sm:w-5" aria-hidden="true" />
              </button>
            )}
          </div>
        </Row>
      ))}

      {hasOther && (
        <Row className="items-center gap-2">
          {answers.length + 1}. <AnswerInput disabled value={'Other'} />
          <div className="mx-1.5">
            <InfoTooltip
              text={
                'The "Other" answer represents all answers that are not listed. New answers are split off from it.'
              }
            />
          </div>
        </Row>
      )}
      {numAnswers < MAX_ANSWERS && (
        <Row className="justify-end gap-2">
          {question && outcomeType === 'MULTIPLE_CHOICE' && (
            <Button
              color="indigo-outline"
              size="xs"
              loading={isGeneratingAnswers}
              onClick={generateAnswers}
              disabled={!question || isGeneratingAnswers}
            >
              Generate with AI
            </Button>
          )}
          <button
            type="button"
            onClick={addAnswer}
            className="hover:bg-canvas-50 border-ink-300 text-ink-700 bg-canvas-0 focus:ring-primary-500 inline-flex items-center rounded border px-2.5 py-1.5 text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2"
          >
            Add {outcomeType == 'POLL' ? 'option' : 'answer'}
            {marginalCost > 0 ? ` +${formatMoney(marginalCost)}` : ''}
          </button>
        </Row>
      )}

      {outcomeType !== 'POLL' && (
        <>
          <Col className="mb-4 items-start gap-2">
            <Row className="items-center gap-2">
              <div className="cursor-pointer">
                Who can add new answers later?
              </div>
              <div>
                <InfoTooltip
                  text={
                    'Determines who will be able to add new answers after question creation.' +
                    (shouldAnswersSumToOne
                      ? ' If enabled, then an "Other" answer will be included.'
                      : '')
                  }
                />
              </div>
            </Row>
            <ChoicesToggleGroup
              currentChoice={addAnswersMode}
              choicesMap={{
                'No one': 'DISABLED',
                You: 'ONLY_CREATOR',
                Anyone: 'ANYONE',
              }}
              setChoice={(c) => setAddAnswersMode(c as any)}
            />
          </Col>

          {/* <Col className="items-start gap-2">
            <Row className="items-center gap-2">
              <div className="cursor-pointer">
                How many answers will be chosen?
              </div>
              <div>
                <InfoTooltip
                  text={
                    'If "One", then one answer will resolve to YES and all the others will resolve to NO. Otherwise, any number of answers can resolve to YES — they are independent.'
                  }
                />
              </div>
            </Row>
            <ChoicesToggleGroup
              currentChoice={shouldAnswersSumToOne ? 'true' : 'false'}
              choicesMap={{
                One: 'true',
                'Any number': 'false',
              }}
              setChoice={(choice) =>
                setShouldAnswersSumToOne(choice === 'true')
              }
            />
          </Col> */}
        </>
      )}
    </Col>
  )
}

export const AnswerInput = (props: {
  id?: string
  disabled?: boolean
  value?: string
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onUp?: () => void
  onDown?: () => void
  onDelete?: () => void
  placeholder?: string
  className?: string
}) => {
  const {
    id,
    disabled,
    value,
    onChange,
    onUp,
    onDown,
    onDelete,
    placeholder,
    className,
  } = props

  const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    // On mobile, scroll the input into view when keyboard appears
    // Only do this on touch devices to avoid annoying desktop scroll behavior
    const isTouchDevice =
      'ontouchstart' in window || navigator.maxTouchPoints > 0
    if (!isTouchDevice) return

    // Delay to allow keyboard animation to complete
    setTimeout(() => {
      e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 300)
  }

  return (
    <ExpandingInput
      id={id}
      className={className || 'w-full sm:ml-2'}
      disabled={disabled}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      onFocus={handleFocus}
      onKeyDown={(e) => {
        if (e.key == 'ArrowUp' && !e.shiftKey && !e.altKey) {
          e.preventDefault()
          e.stopPropagation()
          onUp?.()
        }
        if (e.key == 'ArrowDown' && !e.shiftKey && !e.altKey) {
          e.preventDefault()
          e.stopPropagation()
          onDown?.()
        }
        if (e.key == 'Enter' && !e.shiftKey && !e.altKey) {
          e.preventDefault()
          e.stopPropagation()
          onDown?.()
        }
        if (e.key == 'Backspace' && value === '' && !e.shiftKey && !e.altKey) {
          e.preventDefault()
          e.stopPropagation()
          onDelete?.()
          onUp?.()
        }
      }}
      rows={1}
      maxLength={MAX_ANSWER_LENGTH}
    />
  )
}

const setElement = <T,>(array: T[], i: number, elem: T) => {
  const newArray = array.concat()
  newArray[i] = elem
  return newArray
}
