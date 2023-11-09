import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { rejectLover } from 'web/lib/firebase/love/api'
import { Lover } from 'common/love/lover'

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
      <Button
        className={className}
        color="red-outline"
        size="xs"
        onClick={() => setDialogOpen(true)}
      >
        Unmatch
      </Button>
      {dialogOpen && (
        <Modal open={dialogOpen} setOpen={(open) => setDialogOpen(open)}>
          <Col className="bg-canvas-0 gap-4 rounded p-4 pb-8">
            <div className="text-lg font-semibold">
              Are you sure you don't want a relationship with {lover.user.name}?
            </div>
            <div className="">This action cannot be undone.</div>

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
