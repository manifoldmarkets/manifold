import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { rejectLover } from 'web/lib/firebase/love/api'
import { Lover } from 'common/love/lover'
import { XIcon } from '@heroicons/react/solid'
import clsx from 'clsx'

export const RejectButton = (props: { lover: Lover; className?: string }) => {
  const { lover, className } = props
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submit = async () => {
    setIsSubmitting(true)
    await rejectLover({ userId: lover.user_id })
    setIsSubmitting(false)
    setDialogOpen(false)
    window.location.reload()
  }

  return (
    <>
      <button
        className={clsx(
          'bg-ink-400 hover:bg-ink-500 dark:bg-ink-600 dark:hover:bg-ink-500 h-7 w-7 rounded-full drop-shadow-lg transition-colors',
          className
        )}
        onClick={() => setDialogOpen(true)}
      >
        <XIcon className=" m-auto h-5 w-5 fill-white" />
      </button>
      {dialogOpen && (
        <Modal open={dialogOpen} setOpen={(open) => setDialogOpen(open)}>
          <Col className="bg-canvas-0 gap-4 rounded p-4 pb-8">
            <div className="text-lg font-semibold">
              Are you sure you don't want a relationship with {lover.user.name}?
            </div>
            <div>
              Your relationship market with them will be resolved. This cannot
              be undone.
            </div>

            <Button
              className="font-semibold"
              color="red"
              onClick={() => submit()}
              disabled={isSubmitting}
              loading={isSubmitting}
            >
              Confirm unmatch
            </Button>
          </Col>
        </Modal>
      )}
    </>
  )
}
