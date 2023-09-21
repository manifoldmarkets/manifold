import { useState } from 'react'
import { BsQuestionLg } from 'react-icons/bs'
import { Button } from '../buttons/button'
import { SelectMarketsModal } from '../contract-select-modal'
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
      <SelectMarketsModal
        open={open}
        setOpen={setOpen}
        submitLabel={(len) => `Add ${len} question${len !== 1 ? 's' : ''}`}
        onSubmit={(contracts) => {
          addQuestions(
            contracts.map((contract) => {
              return { type: 'question', slug: contract.slug }
            })
          )
          setOpen(false)
        }}
      />
    </>
  )
}
