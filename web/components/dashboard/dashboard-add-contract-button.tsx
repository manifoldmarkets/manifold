import clsx from 'clsx'
import { useState } from 'react'
import { BsQuestionLg } from 'react-icons/bs'
import { Button } from '../buttons/button'
import { SelectMarkets } from '../contract-select-modal'
import { Col } from '../layout/col'
import { MODAL_CLASS, Modal, SCROLLABLE_MODAL_CLASS } from '../layout/modal'
import { DashboardQuestionItem } from 'common/dashboard'

export function DashboardAddContractButton(props: {
  addQuestions: (questions: DashboardQuestionItem[]) => void
}) {
  const { addQuestions } = props
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        className="w-1/2"
        color="gray-outline"
        onClick={() => setOpen(true)}
      >
        <div className="flex flex-col items-center gap-1 sm:flex-row sm:gap-2">
          <BsQuestionLg className="h-5 w-5" />
          Add question
        </div>
      </Button>
      <Modal open={open} setOpen={setOpen}>
        <Col className={clsx(MODAL_CLASS, 'relative')}>
          <div className="bg-canvas-0 absolute top-0 left-0 right-0 h-10" />

          <SelectMarkets
            submitLabel={(len) => `Add ${len} question${len !== 1 ? 's' : ''}`}
            onSubmit={(contracts) => {
              addQuestions(
                contracts.map((contract) => {
                  return { type: 'question', slug: contract.slug }
                })
              )
              setOpen(false)
            }}
            setOpen={setOpen}
            className={clsx('w-full', SCROLLABLE_MODAL_CLASS)}
          />
        </Col>
      </Modal>
    </>
  )
}
