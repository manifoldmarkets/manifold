import clsx from 'clsx'
import { isAdminId } from 'common/envs/constants'
import { Row as rowFor } from 'common/supabase/utils'
import { User } from 'common/user'
import { lowerCase, partition } from 'lodash'
import {
  QuestionWithCountType,
  useUserCompatibilityAnswers,
} from 'love/hooks/use-questions'
import { useState } from 'react'
import { FaExclamation } from 'react-icons/fa'
import { GoDash } from 'react-icons/go'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Linkify } from 'web/components/widgets/linkify'
import { Tooltip } from 'web/components/widgets/tooltip'
import { useUser } from 'web/hooks/use-user'
import { Subtitle } from '../widgets/lover-subtitle'
import { AddCompatibilityQuestionButton } from './add-compatibility-question-button'
import {
  AnswerCompatibilityQuestionButton,
  AnswerSkippedCompatibilityQuestionsButton,
} from './answer-compatibility-question-button'
import {
  AnswerCompatibilityQuestionContent,
  IMPORTANCE_CHOICES,
  IMPORTANCE_DISPLAY_COLORS,
} from './answer-compatibility-question-content'
import DropdownMenu from 'web/components/comments/dropdown-menu'
import { PencilIcon } from '@heroicons/react/outline'
import { XIcon } from '@heroicons/react/outline'
import { MODAL_CLASS, Modal } from 'web/components/layout/modal'
import { Pagination } from 'web/components/widgets/pagination'

const NUM_QUESTIONS_TO_SHOW = 8

function separateQuestionsArray(
  questions: QuestionWithCountType[],
  skippedAnswerQuestionIds: Set<number>,
  answeredQuestionIds: Set<number>
) {
  const skippedQuestions: QuestionWithCountType[] = []
  const answeredQuestions: QuestionWithCountType[] = []
  const otherQuestions: QuestionWithCountType[] = []

  questions.forEach((q) => {
    if (skippedAnswerQuestionIds.has(q.id)) {
      skippedQuestions.push(q)
    } else if (answeredQuestionIds.has(q.id)) {
      answeredQuestions.push(q)
    } else {
      otherQuestions.push(q)
    }
  })

  return { skippedQuestions, answeredQuestions, otherQuestions }
}

export function CompatibilityQuestionsDisplay(props: {
  isCurrentUser: boolean
  user: User
  allQuestions: QuestionWithCountType[]
  refreshQuestions: () => void
  fromSignup?: boolean
}) {
  const { isCurrentUser, user, allQuestions, refreshQuestions, fromSignup } =
    props
  const { refreshCompatibilityAnswers, compatibilityAnswers } =
    useUserCompatibilityAnswers(user.id)

  const [skippedAnswers, answers] = partition(
    compatibilityAnswers,
    (answer) => answer.importance == -1
  )

  const answeredQuestionIds = new Set(
    answers.map((answer) => answer.question_id)
  )

  const skippedAnswerQuestionIds = new Set(
    skippedAnswers.map((answer) => answer.question_id)
  )

  const { skippedQuestions, answeredQuestions, otherQuestions } =
    separateQuestionsArray(
      allQuestions,
      skippedAnswerQuestionIds,
      answeredQuestionIds
    )

  const refreshCompatibilityAll = () => {
    refreshCompatibilityAnswers()
    refreshQuestions()
  }

  const [page, setPage] = useState(0)
  const currentSlice = page * NUM_QUESTIONS_TO_SHOW
  const shownAnswers = answers.slice(
    currentSlice,
    currentSlice + NUM_QUESTIONS_TO_SHOW
  )

  return (
    <Col className="gap-2">
      <Subtitle>{`${
        isCurrentUser ? 'Your' : user.name.split(' ')[0] + `'s`
      } Compatibility Prompts`}</Subtitle>
      {answeredQuestions.length <= 0 ? (
        <span className="text-ink-600 text-sm">
          {isCurrentUser ? "You haven't" : `${user.name} hasn't`} answered any
          compatibility questions yet!{' '}
          {isCurrentUser && (
            <>Add some to better see who you'd be most compatible with.</>
          )}
        </span>
      ) : (
        <>
          {(otherQuestions.length < 1 || isAdminId(user?.id)) &&
            isCurrentUser && (
              <span>
                {otherQuestions.length < 1 && (
                  <span className="text-ink-600 text-sm">
                    You've already answered all the compatibility questions!
                  </span>
                )}{' '}
                <AddCompatibilityQuestionButton
                  refreshCompatibilityAll={refreshCompatibilityAll}
                />
              </span>
            )}
          {shownAnswers.map((answer) => {
            return (
              <CompatibilityAnswerBlock
                key={answer.question_id}
                answer={answer}
                yourQuestions={answeredQuestions}
                user={user}
                isCurrentUser={isCurrentUser}
                refreshCompatibilityAll={refreshCompatibilityAll}
              />
            )
          })}
        </>
      )}
      {otherQuestions.length >= 1 && isCurrentUser && (
        <AnswerCompatibilityQuestionButton
          user={user}
          otherQuestions={otherQuestions}
          refreshCompatibilityAll={refreshCompatibilityAll}
          fromSignup={fromSignup}
        />
      )}
      {skippedQuestions.length > 0 && (
        <Row className="w-full justify-end">
          <AnswerSkippedCompatibilityQuestionsButton
            user={user}
            skippedQuestions={skippedQuestions}
            refreshCompatibilityAll={refreshCompatibilityAll}
          />
        </Row>
      )}
      {NUM_QUESTIONS_TO_SHOW < compatibilityAnswers.length && (
        <Pagination
          page={page}
          itemsPerPage={NUM_QUESTIONS_TO_SHOW}
          totalItems={compatibilityAnswers.length}
          setPage={setPage}
        />
      )}
    </Col>
  )
}

function CompatibilityAnswerBlock(props: {
  answer: rowFor<'love_compatibility_answers'>
  yourQuestions: QuestionWithCountType[]
  user: User
  isCurrentUser: boolean
  refreshCompatibilityAll: () => void
}) {
  const {
    answer,
    yourQuestions,
    user,
    isCurrentUser,
    refreshCompatibilityAll,
  } = props
  const question = yourQuestions.find((q) => q.id === answer.question_id)
  const [editOpen, setEditOpen] = useState<boolean>(false)

  if (
    !question ||
    !question.multiple_choice_options ||
    answer.multiple_choice == null
  )
    return null

  const answerText = getStringKeyFromNumValue(
    answer.multiple_choice,
    question.multiple_choice_options as Record<string, number>
  )

  return (
    <Col
      className={
        'bg-canvas-0 flex-grow gap-2 whitespace-pre-line rounded-md px-3 py-2 leading-relaxed'
      }
    >
      <Row className="text-ink-600 justify-between gap-1 text-sm">
        {question.question}
        <Row className="gap-2">
          <ImportanceDisplay importance={answer.importance} user={user} />
          {isCurrentUser && (
            <DropdownMenu
              items={[
                {
                  name: 'Edit',
                  icon: <PencilIcon className="h-5 w-5" />,
                  onClick: () => setEditOpen(true),
                },
              ]}
              closeOnClick
              menuWidth="w-40"
            />
          )}
        </Row>
      </Row>
      <Row className="bg-canvas-50 w-fit gap-1 rounded py-1 pl-2 pr-3 text-sm">
        {answerText}
      </Row>
      {answer.explanation && (
        <Linkify className="font-semibold" text={answer.explanation} />
      )}
      <Modal open={editOpen} setOpen={setEditOpen}>
        <Col className={MODAL_CLASS}>
          <AnswerCompatibilityQuestionContent
            key={`edit answer.id`}
            compatibilityQuestion={question}
            answer={answer}
            user={user}
            onSubmit={() => {
              setEditOpen(false)
              refreshCompatibilityAll()
            }}
            isLastQuestion={true}
            noSkip
          />
        </Col>
      </Modal>
    </Col>
  )
}

function ImportanceDisplay(props: { importance: number | null; user: User }) {
  const { importance, user } = props

  if (importance == null) return null
  const importanceText = getStringKeyFromNumValue(
    importance,
    IMPORTANCE_CHOICES
  )
  return (
    <Tooltip
      text={`Compatibility on this is ${lowerCase(importanceText)} to ${
        user.name.split(' ')[0]
      }`}
    >
      <Row
        className={clsx(
          IMPORTANCE_DISPLAY_COLORS[importance],
          'text-ink-800 mt-0.5 h-min w-6 select-none rounded-full bg-opacity-50 px-1.5 py-0.5 text-xs sm:w-fit'
        )}
      >
        <div className="hidden sm:inline">{importanceText}</div>
        <div className="mx-auto sm:hidden">
          {importance == 0 ? (
            <GoDash className="h-[12px] w-[12px]" />
          ) : (
            <Row className="gap-0.5">
              {Array.from({ length: importance }, (_, index) => (
                <FaExclamation className="h-[12px] w-[3px]" key={index} /> // Replace YourComponent with the actual component you want to repeat
              ))}
            </Row>
          )}
        </div>
      </Row>
    </Tooltip>
  )
}

function getStringKeyFromNumValue(
  value: number,
  map: Record<string, number>
): string | undefined {
  const choices = Object.keys(map) as (keyof typeof map)[]
  return choices.find((choice) => map[choice] === value)
}
