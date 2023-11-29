import { User } from 'common/user'
import { Row as rowFor, run } from 'common/supabase/utils'
import { Col } from 'web/components/layout/col'
import { RadioToggleGroup } from 'web/components/widgets/radio-toggle-group'
import { useState } from 'react'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { RadioGroup } from '@headlessui/react'
import clsx from 'clsx'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { SCROLLABLE_MODAL_CLASS } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/buttons/button'
import { filterKeys } from '../questions-form'
import { db } from 'web/lib/supabase/db'

export type CompatibilityAnswerSubmitType = Omit<
  rowFor<'love_compatibility_answers'>,
  'created_time' | 'id'
>

export const IMPORTANCE_CHOICES = {
  'Not Important': 0,
  'Somewhat Important': 1,
  Important: 2,
  'Very Important': 3,
}

type ImportanceColorsType = {
  [key: number]: string
}

export const IMPORTANCE_RADIO_COLORS: ImportanceColorsType = {
  0: `bg-stone-400 ring-stone-400 dark:bg-stone-500 dark:ring-stone-500`,
  1: `bg-teal-200 ring-teal-200 dark:bg-teal-100 dark:ring-teal-100 `,
  2: `bg-teal-300 ring-teal-300 dark:bg-teal-200 dark:ring-teal-200 `,
  3: `bg-teal-400 ring-teal-400`,
}

export const IMPORTANCE_DISPLAY_COLORS: ImportanceColorsType = {
  0: `bg-stone-300 dark:bg-stone-600 `,
  1: `bg-teal-200`,
  2: `bg-teal-300 `,
  3: `bg-teal-400`,
}

export const submitCompatibilityAnswer = async (
  newAnswer: CompatibilityAnswerSubmitType
) => {
  if (!newAnswer) return
  const input = {
    ...filterKeys(newAnswer, (key, _) => !['id', 'created_time'].includes(key)),
  }
  await run(
    db
      .from('love_compatibility_answers')
      .upsert(input, { onConflict: 'question_id,creator_id' })
  )
}

export function AnswerCompatibilityQuestionContent(props: {
  compatibilityQuestion: rowFor<'love_questions'>
  user: User
  onSubmit: () => void
  onNext?: () => void
  isLastQuestion: boolean
}) {
  const { compatibilityQuestion, user, onSubmit, isLastQuestion, onNext } =
    props

  const [answer, setAnswer] = useState<CompatibilityAnswerSubmitType>({
    creator_id: user.id,
    explanation: null,
    multiple_choice: -1,
    pref_choices: [],
    question_id: compatibilityQuestion.id,
    importance: -1,
  })

  const [loading, setLoading] = useState(false)
  if (
    compatibilityQuestion.answer_type !== 'compatibility_multiple_choice' ||
    !compatibilityQuestion.multiple_choice_options
  ) {
    return null
  }

  const onPrefChoiceClick = (n: number) => {
    if (answer.pref_choices?.includes(n)) {
      // If the number is already selected, remove it from the array
      setAnswer({
        ...answer,
        pref_choices: answer.pref_choices.filter((c) => c !== n),
      })
    } else {
      // If the number is not selected, add it to the array
      setAnswer({
        ...answer,
        pref_choices: [...(answer.pref_choices ?? []), n],
      })
    }
  }

  const multipleChoiceValid =
    answer.multiple_choice != null && answer.multiple_choice !== -1

  const prefChoicesValid = answer.pref_choices && answer.pref_choices.length > 0

  const importanceValid = answer.importance !== null && answer.importance !== -1

  return (
    <Col className="w-full gap-4">
      {compatibilityQuestion.question}
      <Col className={clsx(SCROLLABLE_MODAL_CLASS, 'w-full gap-4')}>
        <Col className="gap-1">
          <span className="text-ink-500 text-sm">Your answer</span>
          <RadioGroup
            className={
              'border-ink-300 text-ink-400 bg-canvas-0 inline-flex flex-col gap-2 rounded-md border p-1 text-sm shadow-sm'
            }
            value={answer.multiple_choice}
            onChange={(choice: number) =>
              setAnswer({ ...answer, multiple_choice: choice })
            }
          >
            {Object.entries(compatibilityQuestion.multiple_choice_options)
              .sort((a, b) => a[1] - b[1])
              .map(([choiceKey, choice]) => (
                <RadioGroup.Option
                  key={choiceKey}
                  value={choice}
                  className={({ disabled }) =>
                    clsx(
                      disabled
                        ? 'text-ink-300 aria-checked:bg-ink-300 aria-checked:text-ink-0 cursor-not-allowed'
                        : 'text-ink-700 hover:bg-ink-50 aria-checked:bg-primary-100 aria-checked:text-primary-900 cursor-pointer',
                      'ring-primary-500 flex items-center rounded-md p-2 outline-none transition-all focus-visible:ring-2 sm:px-3'
                    )
                  }
                >
                  <RadioGroup.Label as="span">{choiceKey}</RadioGroup.Label>
                </RadioGroup.Option>
              ))}
          </RadioGroup>
        </Col>
        <Col className="gap-1">
          <span className="text-ink-500 text-sm">Answers you'll accept</span>
          <Col
            className={
              'border-ink-300 text-ink-400 bg-canvas-0 inline-flex flex-col gap-2 rounded-md border p-1 text-sm shadow-sm'
            }
          >
            {Object.entries(compatibilityQuestion.multiple_choice_options)
              .sort((a, b) => a[1] - b[1])
              .map(([choiceKey, choice]) => (
                <button
                  key={choiceKey}
                  onClick={() => onPrefChoiceClick(choice)}
                  className={clsx(
                    answer.pref_choices?.includes(choice)
                      ? 'bg-primary-100 text-primary-900'
                      : 'text-ink-700 hover:bg-ink-50',
                    'ring-primary-500 flex cursor-pointer items-center rounded-md p-2 text-left outline-none transition-all focus-visible:ring-2 sm:px-3'
                  )}
                >
                  {choiceKey}
                </button>
              ))}
          </Col>
        </Col>
        <Col className="gap-1">
          <span className="text-ink-400 text-sm">Importance</span>
          <RadioToggleGroup
            currentChoice={answer.importance ?? -1}
            choicesMap={IMPORTANCE_CHOICES}
            setChoice={(choice: number) =>
              setAnswer({ ...answer, importance: choice })
            }
            indexColors={IMPORTANCE_RADIO_COLORS}
          />
        </Col>
        <Col className="-mt-6 gap-1">
          <span className="text-ink-400 text-sm">Explanation</span>
          <ExpandingInput
            className={'w-full'}
            rows={3}
            value={answer.explanation ?? ''}
            onChange={(e) =>
              setAnswer({ ...answer, explanation: e.target.value })
            }
          />
        </Col>
      </Col>
      <Row className="w-full justify-end">
        <Col className="gap-1">
          <Button
            disabled={
              !multipleChoiceValid || !prefChoicesValid || !importanceValid
            }
            loading={loading}
            onClick={() => {
              setLoading(true)
              submitCompatibilityAnswer(answer)
                .then(() => {
                  if (isLastQuestion) {
                    onSubmit()
                  } else if (onNext) {
                    onNext()
                  }
                })
                .finally(() => setLoading(false))
            }}
          >
            {isLastQuestion ? 'Finish' : 'Next'}
          </Button>
          <button
            onClick={onNext}
            className="text-ink-500 text-sm hover:underline"
          >
            Skip
          </button>
        </Col>
      </Row>
    </Col>
  )
}
