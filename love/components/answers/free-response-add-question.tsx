import { PlusIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Row as rowFor } from 'common/supabase/utils'
import { User } from 'common/user'
import { QuestionWithCountType } from 'love/hooks/use-questions'
import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import {
  MODAL_CLASS,
  Modal,
  SCROLLABLE_MODAL_CLASS,
} from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { IndividualQuestionRow } from '../questions-form'
import { TbMessage } from 'react-icons/tb'
import { OtherLoverAnswers } from './other-lover-answers'
import { ArrowLeftIcon } from '@heroicons/react/outline'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'

export function AddQuestionButton(props: {
  isFirstQuestion?: boolean
  questions: QuestionWithCountType[]
  user: User
  refreshAnswers: () => void
}) {
  const { isFirstQuestion, questions, user, refreshAnswers } = props
  const [openModal, setOpenModal] = usePersistentInMemoryState(
    false,
    `add-question-${user.id}`
  )
  return (
    <>
      <Button
        color={isFirstQuestion ? 'indigo' : 'gray-outline'}
        onClick={() => setOpenModal(true)}
      >
        <Row className="items-center gap-1">
          <PlusIcon className="h-4 w-4" />
          Add A Prompt
        </Row>
      </Button>
      <AddQuestionModal
        open={openModal}
        setOpen={setOpenModal}
        questions={questions}
        user={user}
        refreshAnswers={refreshAnswers}
      />
    </>
  )
}

function AddQuestionModal(props: {
  open: boolean
  setOpen: (open: boolean) => void
  questions: QuestionWithCountType[]
  user: User
  refreshAnswers: () => void
}) {
  const { open, setOpen, questions, user, refreshAnswers } = props
  const addableQuestions = questions.filter(
    (q) => q.answer_type === 'free_response'
  )
  const [selectedQuestion, setSelectedQuestion] =
    usePersistentInMemoryState<QuestionWithCountType | null>(
      null,
      `selected-added-question-${user.id}}`
    )

  const [expandedQuestion, setExpandedQuestion] =
    usePersistentInMemoryState<QuestionWithCountType | null>(
      null,
      `selected-expanded-question-${user.id}}`
    )

  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={clsx(MODAL_CLASS)}>
        {expandedQuestion ? (
          <Col>
            <Row className="mb-1 items-center">
              <Button
                size={'sm'}
                color={'gray-white'}
                className={'ml-1 rounded-full'}
                onClick={() => {
                  setExpandedQuestion(null)
                }}
              >
                <ArrowLeftIcon className={'h-4 w-4'} />
              </Button>
              <span className="font-semibold">{expandedQuestion.question}</span>
            </Row>
            <OtherLoverAnswers
              question={expandedQuestion}
              user={user}
              className={SCROLLABLE_MODAL_CLASS}
            />
          </Col>
        ) : selectedQuestion == null ? (
          <>
            <div className="text-primary-600  w-full font-semibold">
              Choose a question to answer
            </div>
            <Col className={SCROLLABLE_MODAL_CLASS}>
              {addableQuestions.map((question) => {
                return (
                  <Row
                    key={question.id}
                    className="hover:bg-canvas-50 grow-y flex w-full items-center justify-between rounded"
                  >
                    <button
                      onClick={() => {
                        setSelectedQuestion(question)
                      }}
                      className="flex grow flex-row p-2  text-left"
                    >
                      {question.question}
                    </button>
                    <button
                      className="text-ink-500 flex cursor-pointer flex-row gap-0.5 pr-2 text-xs transition-all hover:text-indigo-500"
                      onClick={() => {
                        setExpandedQuestion(question)
                      }}
                    >
                      {question.answer_count}
                      <TbMessage className="h-4 w-4" />
                    </button>
                  </Row>
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
