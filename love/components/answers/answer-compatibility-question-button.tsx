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
  refreshCompatibilityAll: () => void
}) {
  const { user, otherQuestions, refreshCompatibilityAll } = props
  const [open, setOpen] = useState(false)
  if (!user) return null
  return (
    <>
      <Button onClick={() => setOpen(true)} color="gray-outline">
        <Row className="items-center gap-1">Answer Compatibility Questions</Row>
      </Button>
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
