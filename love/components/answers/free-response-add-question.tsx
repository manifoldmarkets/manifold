import { PlusIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Row as rowFor } from 'common/supabase/utils'
import { User } from 'common/user'
import { useFreeResponseQuestions } from 'love/hooks/use-questions'
import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import {
  MODAL_CLASS,
  Modal,
  SCROLLABLE_MODAL_CLASS,
} from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { IndividualQuestionRow, loveAnswerState } from '../questions-form'

export function AddQuestionButton(props: {
  isFirstQuestion?: boolean
  answers: rowFor<'love_answers'>[]
  questions: rowFor<'love_questions'>[]
  user: User
  refreshAnswers: () => void
}) {
  const { isFirstQuestion, answers, questions, user, refreshAnswers } = props
  const [openModal, setOpenModal] = useState(false)
  return (
    <>
      <Button
        color={isFirstQuestion ? 'indigo' : 'gray-outline'}
        onClick={() => setOpenModal(true)}
      >
        {isFirstQuestion ? (
          <>Answer Questions</>
        ) : (
          <Row className="items-center gap-1">
            <PlusIcon className="h-4 w-4" />
            Add Question
          </Row>
        )}
      </Button>
      <AddQuestionModal
        open={openModal}
        setOpen={setOpenModal}
        userQuestions={questions}
        user={user}
        refreshAnswers={refreshAnswers}
      />
    </>
  )
}

function AddQuestionModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  userQuestions: rowFor<'love_questions'>[]
  user: User
  refreshAnswers: () => void
}) {
  const { open, setOpen, userQuestions, user, refreshAnswers } = props
  const addableQuestions = useFreeResponseQuestions()
  const [selectedQuestion, setSelectedQuestion] =
    useState<rowFor<'love_questions'> | null>(null)

  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={clsx(MODAL_CLASS)}>
        {selectedQuestion == null ? (
          <>
            <div className="text-primary-600  w-full font-semibold">
              Choose a question to answer
            </div>
            <Col className={SCROLLABLE_MODAL_CLASS}>
              {addableQuestions
                .filter((aq) => !userQuestions.some((uq) => uq.id === aq.id))
                .map((question) => {
                  return (
                    <button
                      onClick={() => {
                        setSelectedQuestion(question)
                      }}
                      className="hover:bg-canvas-50 grow-y flex w-full rounded p-2 text-left"
                    >
                      {question.question}
                    </button>
                  )
                })}
            </Col>
          </>
        ) : (
          <Col className="gap-4">
            <div className="text-semibold text-lg">
              {selectedQuestion.question}
            </div>
            <IndividualQuestionRow
              user={user}
              row={selectedQuestion}
              onCancel={() => {
                setOpen(false)
                setSelectedQuestion(null)
              }}
              onSubmit={() => {
                refreshAnswers()
                setOpen(false)
                setSelectedQuestion(null)
              }}
            />
          </Col>
        )}
      </Col>
    </Modal>
  )
}
