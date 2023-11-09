import {
  MODAL_CLASS,
  Modal,
  SCROLLABLE_MODAL_CLASS,
} from 'web/components/layout/modal'
import { useFreeResponseQuestions } from 'love/hooks/use-questions'
import { useState } from 'react'
import { Title } from 'web/components/widgets/title'
import clsx from 'clsx'
import { Spacer } from 'web/components/layout/spacer'
import { Row as rowFor } from 'common/supabase/utils'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'

export function AddQuestionButton(props: {
  answers: rowFor<'love_answers'>[]
  questions: rowFor<'love_questions'>[]
}) {
  const [openModal, setOpenModal] = useState(false)
  return (
    <>
      <Button color="indigo" onClick={() => setOpenModal(true)}>
        Answer questions
      </Button>
      <AddQuestionModal
        open={openModal}
        setOpen={setOpenModal}
        answers={props.answers}
        userQuestions={props.questions}
      />
    </>
  )
}

function AddQuestionModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  answers: rowFor<'love_answers'>[]
  userQuestions: rowFor<'love_questions'>[]
}) {
  const { open, setOpen, answers, userQuestions } = props
  const addableQuestions = useFreeResponseQuestions()
  const [selectedQuestion, setSelectedQuestion] = useState<number | null>(null)
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
                        setSelectedQuestion(question.id)
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
          <Col className="gap-2">
            <div className="text-ink-600 text-sm">
              {addableQuestions.find((q) => q.id === selectedQuestion)
                ?.question ?? ''}
            </div>
            <Row className="w-full justify-between">
              <Button
                onClick={() => {
                  setSelectedQuestion(null)
                }}
                color="gray-outline"
              >
                Back
              </Button>
              <Button
                onClick={() => {
                  setSelectedQuestion(null)
                }}
              >
                Save
              </Button>
            </Row>
          </Col>
        )}
      </Col>
    </Modal>
  )
}
