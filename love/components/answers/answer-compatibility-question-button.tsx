import { User } from 'common/user'
import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { MODAL_CLASS, Modal } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { AnswerCompatibilityQuestionContent } from './answer-compatibility-question-content'
import { QuestionWithCountType } from 'love/hooks/use-questions'

export function AnswerCompatibilityQuestionButton(props: {
  user: User | null | undefined
  otherQuestions: QuestionWithCountType[]
  refreshCompatibilityAnswers: () => void
  refreshQuestions: () => void
}) {
  const {
    user,
    otherQuestions,
    refreshCompatibilityAnswers,
    refreshQuestions,
  } = props
  const [open, setOpen] = useState(false)
  if (!user) return null
  return (
    <>
      <Button onClick={() => setOpen(true)} color="gray-outline">
        <Row className="items-center gap-1">Answer Compatibility Question</Row>
      </Button>
      <AnswerCompatibilityQuestionModal
        open={open}
        setOpen={setOpen}
        user={user}
        otherQuestions={otherQuestions}
        refreshCompatibilityAnswers={refreshCompatibilityAnswers}
        refreshQuestions={refreshQuestions}
      />
    </>
  )
}

function AnswerCompatibilityQuestionModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  user: User
  otherQuestions: QuestionWithCountType[]
  refreshCompatibilityAnswers: () => void
  refreshQuestions: () => void
}) {
  const {
    open,
    setOpen,
    user,
    otherQuestions,
    refreshCompatibilityAnswers,
    refreshQuestions,
  } = props
  const [questionIndex, setQuestionIndex] = useState(0)

  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={MODAL_CLASS}>
        <AnswerCompatibilityQuestionContent
          key={otherQuestions[questionIndex].id}
          compatibilityQuestion={otherQuestions[questionIndex]}
          user={user}
          onSubmit={() => {
            refreshCompatibilityAnswers()
            refreshQuestions()
            setOpen(false)
          }}
          isLastQuestion={questionIndex === otherQuestions.length - 1}
          onNext={() => {
            setQuestionIndex(questionIndex + 1)
          }}
        />
      </Col>
    </Modal>
  )
}
