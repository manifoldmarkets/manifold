import { User } from 'common/user'
import { QuestionWithCountType } from 'love/hooks/use-questions'
import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { MODAL_CLASS, Modal } from 'web/components/layout/modal'
import { AnswerCompatibilityQuestionContent } from './answer-compatibility-question-content'

export function AnswerCompatibilityQuestionButton(props: {
  user: User | null | undefined
  otherQuestions: QuestionWithCountType[]
  refreshCompatibilityAll: () => void
  fromSignup?: boolean
  size?: 'sm' | 'md'
}) {
  const {
    user,
    otherQuestions,
    refreshCompatibilityAll,
    fromSignup,
    size = 'md',
  } = props
  const [open, setOpen] = useState(fromSignup ?? false)
  if (!user) return null
  return (
    <>
      {size === 'md' ? (
        <Button onClick={() => setOpen(true)} color="gray-outline">
          Answer Questions{' '}
          <span className="text-primary-600 ml-2">
            +{otherQuestions.length}
          </span>
        </Button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="bg-ink-100 dark:bg-ink-300 text-ink-1000 hover:bg-ink-200 hover:dark:bg-ink-400 w-24 rounded-full px-2 py-0.5 text-xs transition-colors"
        >
          Answer
        </button>
      )}
      <AnswerCompatibilityQuestionModal
        open={open}
        setOpen={setOpen}
        user={user}
        otherQuestions={otherQuestions}
        refreshCompatibilityAll={refreshCompatibilityAll}
      />
    </>
  )
}

export function AnswerSkippedCompatibilityQuestionsButton(props: {
  user: User | null | undefined
  skippedQuestions: QuestionWithCountType[]
  refreshCompatibilityAll: () => void
}) {
  const { user, skippedQuestions, refreshCompatibilityAll } = props
  const [open, setOpen] = useState(false)
  if (!user) return null
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-ink-500 text-sm hover:underline"
      >
        Answer {skippedQuestions.length} skipped questions{' '}
      </button>
      <AnswerCompatibilityQuestionModal
        open={open}
        setOpen={setOpen}
        user={user}
        otherQuestions={skippedQuestions}
        refreshCompatibilityAll={refreshCompatibilityAll}
      />
    </>
  )
}

function AnswerCompatibilityQuestionModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  user: User
  otherQuestions: QuestionWithCountType[]
  refreshCompatibilityAll: () => void
}) {
  const { open, setOpen, user, otherQuestions, refreshCompatibilityAll } = props
  const [questionIndex, setQuestionIndex] = useState(0)
  return (
    <Modal
      open={open}
      setOpen={setOpen}
      onClose={() => {
        refreshCompatibilityAll()
        setQuestionIndex(0)
      }}
    >
      <Col className={MODAL_CLASS}>
        <AnswerCompatibilityQuestionContent
          key={otherQuestions[questionIndex].id}
          index={questionIndex}
          total={otherQuestions.length}
          compatibilityQuestion={otherQuestions[questionIndex]}
          user={user}
          onSubmit={() => {
            setOpen(false)
          }}
          isLastQuestion={questionIndex === otherQuestions.length - 1}
          onNext={() => {
            if (questionIndex === otherQuestions.length - 1) {
              setOpen(false)
            } else {
              setQuestionIndex(questionIndex + 1)
            }
          }}
        />
      </Col>
    </Modal>
  )
}
