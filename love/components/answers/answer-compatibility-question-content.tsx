import { User } from 'common/user'
import { Row as rowFor } from 'common/supabase/utils'
import { Col } from 'web/components/layout/col'
import { RadioToggleGroup } from 'web/components/widgets/radio-toggle-group'
import { useState } from 'react'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { RadioGroup } from '@headlessui/react'
import clsx from 'clsx'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { SCROLLABLE_MODAL_CLASS } from 'web/components/layout/modal'

export type CompatibilityAnswerSubmitType = Omit<
  rowFor<'love_compatibility_answers'>,
  'created_time' | 'id'
>

export function AnswerCompatibilityQuestionContent(props: {
  compatibilityQuestion: rowFor<'love_questions'>
  user: User
}) {
  const { compatibilityQuestion, user } = props

  const [answer, setAnswer] = useState<CompatibilityAnswerSubmitType>({
    creator_id: user.id,
    explanation: null,
    multiple_choice: -1,
    pref_choices: [],
    question_id: compatibilityQuestion.id,
    importance: -1,
  })

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

  return (
    <Col className="w-full gap-4">
      {compatibilityQuestion.question}
      <Col className={clsx(SCROLLABLE_MODAL_CLASS, 'w-full gap-4')}>
        <Col className="gap-1">
          <span className="text-ink-400 text-sm">Your answer</span>
          <RadioGroup
            className={
              'border-ink-300 text-ink-400 bg-canvas-0 inline-flex flex-col gap-2 rounded-md border p-1 text-sm shadow-sm'
            }
            value={answer.multiple_choice}
            onChange={(choice: number) =>
              setAnswer({ ...answer, multiple_choice: choice })
            }
          >
            {Object.entries(compatibilityQuestion.multiple_choice_options).map(
              ([choiceKey, choice]) => (
                <RadioGroup.Option
                  key={choiceKey}
                  value={choice}
                  className={({ disabled }) =>
                    clsx(
                      disabled
                        ? 'text-ink-300 aria-checked:bg-ink-300 aria-checked:text-ink-0 cursor-not-allowed'
                        : 'text-ink-500 hover:bg-ink-50 aria-checked:bg-primary-100 aria-checked:text-primary-900 cursor-pointer',
                      'ring-primary-500 flex items-center rounded-md p-2 outline-none transition-all focus-visible:ring-2 sm:px-3'
                    )
                  }
                >
                  <RadioGroup.Label as="span">{choiceKey}</RadioGroup.Label>
                </RadioGroup.Option>
              )
            )}
          </RadioGroup>
        </Col>
        <Col className="gap-1">
          <span className="text-ink-400 text-sm">Answers you'll accept</span>
          <Col
            className={
              'border-ink-300 text-ink-400 bg-canvas-0 inline-flex flex-col gap-2 rounded-md border p-1 text-sm shadow-sm'
            }
          >
            {Object.entries(compatibilityQuestion.multiple_choice_options).map(
              ([choiceKey, choice]) => (
                <button
                  key={choiceKey}
                  onClick={() => onPrefChoiceClick(choice)}
                  className={clsx(
                    answer.pref_choices?.includes(choice)
                      ? 'bg-primary-100 text-primary-900'
                      : 'text-ink-500 hover:bg-ink-50',
                    'ring-primary-500 flex cursor-pointer items-center rounded-md p-2 outline-none transition-all focus-visible:ring-2 sm:px-3'
                  )}
                >
                  {choiceKey}
                </button>
              )
            )}
          </Col>
        </Col>
        <Col className="gap-1">
          <span className="text-ink-400 text-sm">Importance</span>
          <RadioToggleGroup
            currentChoice={answer.importance ?? -1}
            choicesMap={{
              "Don't care": 0,
              'Somewhat Important': 1,
              Important: 2,
              'Very Important': 3,
              Necessary: 4,
            }}
            setChoice={(choice: number) =>
              setAnswer({ ...answer, importance: choice })
            }
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
    </Col>
  )
}
