import { PencilIcon } from '@heroicons/react/outline'
import { getMutualAnswerCompatibility } from 'common/love/compatibility-score'
import { Lover } from 'common/love/lover'
import { Row as rowFor } from 'common/supabase/utils'
import { User } from 'common/user'
import { partition } from 'lodash'
import { useLover } from 'love/hooks/use-lover'
import {
  QuestionWithCountType,
  useCompatibilityQuestionsWithAnswerCount,
  useUserCompatibilityAnswers,
} from 'love/hooks/use-questions'
import { useEffect, useState } from 'react'
import DropdownMenu from 'web/components/comments/dropdown-menu'
import { Col } from 'web/components/layout/col'
import {
  MODAL_CLASS,
  Modal,
  SCROLLABLE_MODAL_CLASS,
} from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { Linkify } from 'web/components/widgets/linkify'
import { Pagination } from 'web/components/widgets/pagination'
import { db } from 'web/lib/supabase/db'
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
import clsx from 'clsx'
import { shortenName } from 'web/components/widgets/user-link'
import {
  PreferredList,
  PreferredListNoComparison,
} from './compatibility-question-preferred-list'
import { useUser } from 'web/hooks/use-user'

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
  lover: Lover
  fromSignup?: boolean
  fromLoverPage?: Lover
}) {
  const { isCurrentUser, user, fromSignup, fromLoverPage, lover } = props

  const { refreshCompatibilityQuestions, compatibilityQuestionsWithCount } =
    useCompatibilityQuestionsWithAnswerCount()

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
      compatibilityQuestionsWithCount,
      skippedAnswerQuestionIds,
      answeredQuestionIds
    )

  const refreshCompatibilityAll = () => {
    refreshCompatibilityAnswers()
    refreshCompatibilityQuestions()
  }

  const [page, setPage] = useState(0)
  const currentSlice = page * NUM_QUESTIONS_TO_SHOW
  const shownAnswers = answers.slice(
    currentSlice,
    currentSlice + NUM_QUESTIONS_TO_SHOW
  )

  return (
    <Col className="gap-4">
      <Subtitle>{`${
        isCurrentUser ? 'Your' : shortenName(user.name) + `'s`
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
          {isCurrentUser && (
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
                lover={lover}
                fromLoverPage={fromLoverPage}
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
      {skippedQuestions.length > 0 && isCurrentUser && (
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
          totalItems={answers.length}
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
  lover: Lover
  refreshCompatibilityAll: () => void
  fromLoverPage?: Lover
}) {
  const {
    answer,
    yourQuestions,
    user,
    lover,
    isCurrentUser,
    refreshCompatibilityAll,
    fromLoverPage,
  } = props
  const question = yourQuestions.find((q) => q.id === answer.question_id)
  const [editOpen, setEditOpen] = useState<boolean>(false)
  const currentUser = useUser()
  const currentLover = useLover()

  const comparedLover = isCurrentUser
    ? null
    : !!fromLoverPage
    ? fromLoverPage
    : { ...currentLover, user: currentUser }

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
  const preferredAnswersText = answer.pref_choices.map((choice) =>
    getStringKeyFromNumValue(
      choice,
      question.multiple_choice_options as Record<string, number>
    )
  )
  const distinctPreferredAnswersText = preferredAnswersText.filter(
    (text) => text !== answerText
  )
  const preferredDoesNotIncludeAnswerText =
    !preferredAnswersText.includes(answerText)

  return (
    <Col
      className={
        'bg-canvas-0 flex-grow gap-4 whitespace-pre-line rounded-md px-3 py-2 leading-relaxed'
      }
    >
      <Row className="text-ink-600 justify-between gap-1 text-sm">
        {question.question}
        <Row className="gap-4">
          {comparedLover && (
            <div className="hidden sm:block">
              <CompatibilityDisplay
                question={question}
                lover1={lover}
                answer1={answer}
                lover2={comparedLover as Lover}
                currentUserIsComparedLover={!fromLoverPage}
                currentUser={currentUser}
              />
            </div>
          )}
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
      {distinctPreferredAnswersText.length > 0 && (
        <Col className="gap-2">
          <div className="text-ink-600 text-sm">
            {preferredDoesNotIncludeAnswerText
              ? 'Acceptable'
              : 'Also acceptable'}
          </div>
          <Row className="gap-2">
            {distinctPreferredAnswersText.map((text) => (
              <Row
                key={text}
                className="bg-canvas-50 w-fit gap-1 rounded py-1 pl-2 pr-3 text-sm"
              >
                {text}
              </Row>
            ))}
          </Row>
        </Col>
      )}
      <Col className="gap-2">
        {answer.explanation && (
          <Linkify className="font-semibold" text={answer.explanation} />
        )}
        {comparedLover && (
          <Row className="w-full justify-end sm:hidden">
            <CompatibilityDisplay
              question={question}
              lover1={lover}
              answer1={answer}
              lover2={comparedLover as Lover}
              currentUserIsComparedLover={!fromLoverPage}
              currentUser={currentUser}
            />
          </Row>
        )}
      </Col>
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

function CompatibilityDisplay(props: {
  question: QuestionWithCountType
  lover1: Lover
  lover2: Lover
  answer1: rowFor<'love_compatibility_answers'>
  currentUserIsComparedLover: boolean
  currentUser: User | null | undefined
  className?: string
}) {
  const {
    question,
    lover1,
    lover2,
    answer1,
    currentUserIsComparedLover,
    currentUser,
  } = props

  const [answer2, setAnswer2] = useState<
    rowFor<'love_compatibility_answers'> | null | undefined
  >(undefined)

  async function getComparedLoverAnswer() {
    db.from('love_compatibility_answers')
      .select()
      .eq('creator_id', lover2.user_id)
      .eq('question_id', question.id)
      .then((res) => {
        if (res.error) {
          console.error(res.error)
          return
        }
        setAnswer2(res.data[0] ?? null)
      })
  }
  useEffect(() => {
    getComparedLoverAnswer()
  }, [])

  const [open, setOpen] = useState(false)

  if (lover1.id === lover2.id) return null

  const showCreateAnswer =
    (!answer2 || answer2.importance == -1) &&
    currentUserIsComparedLover &&
    !!currentUser

  const isCurrentUser = currentUser?.id === lover2.user_id

  const answerCompatibility = answer2
    ? getMutualAnswerCompatibility(answer1, answer2)
    : undefined
  const user1 = lover1.user
  const user2 = lover2.user

  const importanceScore = answer1.importance

  return (
    <Row className="gap-2">
      <button
        onClick={() => setOpen(true)}
        className={clsx(
          'text-ink-1000 h-fit w-28 rounded-full px-2 py-0.5 text-xs transition-colors',
          IMPORTANCE_DISPLAY_COLORS[importanceScore]
        )}
      >
        <ImportanceDisplay importance={importanceScore} />
      </button>

      {showCreateAnswer || !answerCompatibility || !answer2 ? (
        <AnswerCompatibilityQuestionButton
          user={currentUser}
          otherQuestions={[question]}
          refreshCompatibilityAll={getComparedLoverAnswer}
          size="sm"
        />
      ) : (
        <>
          <button
            onClick={() => setOpen(true)}
            className={clsx(
              'text-ink-1000 h-fit w-28 rounded-full px-2 py-0.5 text-xs transition-colors',
              answerCompatibility <= 0.25
                ? 'bg-red-500/20 hover:bg-red-500/30'
                : answerCompatibility <= 0.5
                ? 'bg-yellow-500/20 hover:bg-yellow-500/30'
                : 'bg-green-500/20 hover:bg-green-500/30'
            )}
          >
            {answerCompatibility <= 0.25
              ? 'Incompatible'
              : answerCompatibility <= 0.5
              ? 'Semi-compatible'
              : 'Compatible'}
          </button>
        </>
      )}
      <Modal open={open} setOpen={setOpen}>
        <Col className={MODAL_CLASS}>
          <Subtitle>{question.question}</Subtitle>
          <Col className={clsx('w-full gap-1', SCROLLABLE_MODAL_CLASS)}>
            <div className="text-ink-600 items-center gap-2">
              {`${shortenName(user1.name)}'s preferred answers`}
            </div>
            <div className="text-ink-500 text-sm">
              {shortenName(user1.name)} marked this as{' '}
              <span className="font-semibold">
                <ImportanceDisplay importance={answer1.importance} />
              </span>
            </div>
            {!answer2 && (
              <PreferredListNoComparison question={question} answer={answer1} />
            )}
            {answer2 && (
              <>
                <PreferredList
                  answer={answer1}
                  question={question}
                  comparedAnswer={answer2}
                  comparedUser={user2}
                  isComparedUser={isCurrentUser}
                />

                <div className="text-ink-600 mt-6 items-center gap-2">
                  {`${
                    isCurrentUser ? 'Your' : shortenName(user2.name) + `'s`
                  } preferred answers`}
                </div>
                <div className="text-ink-500 text-sm">
                  {isCurrentUser ? 'You' : shortenName(user2.name)} marked this
                  as{' '}
                  <span className="font-semibold">
                    <ImportanceDisplay importance={answer2.importance} />
                  </span>
                </div>
                <PreferredList
                  answer={answer2}
                  question={question}
                  comparedAnswer={answer1}
                  comparedUser={user1}
                />
              </>
            )}
          </Col>
        </Col>
      </Modal>
    </Row>
  )
}

function ImportanceDisplay(props: { importance: number }) {
  const { importance } = props
  return (
    <span className={clsx('w-fit')}>
      {getStringKeyFromNumValue(importance, IMPORTANCE_CHOICES)}
    </span>
  )
}

function getStringKeyFromNumValue(
  value: number,
  map: Record<string, number>
): string | undefined {
  const choices = Object.keys(map) as (keyof typeof map)[]
  return choices.find((choice) => map[choice] === value)
}
