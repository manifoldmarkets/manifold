import { Lover } from 'common/love/lover'
import { useState } from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { confirmLoverStage } from 'web/lib/firebase/love/api'

export const ConfirmStageButton = (props: {
  lover: Lover
  stage: string
  contractId: string
  answerId: string
  className?: string
}) => {
  const { lover, stage, contractId, answerId, className } = props
  const [dialogOpen, setDialogOpen] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submit = async () => {
    setIsSubmitting(true)
    await confirmLoverStage({ contractId, answerId })
      .then(() => {
        setDialogOpen(false)
      })
      .catch((e) => {
        setError(e.message)
      })
    setIsSubmitting(false)
  }

  return (
    <>
      <Button
        className={className}
        color="green-outline"
        size="2xs"
        onClick={() => setDialogOpen(true)}
      >
        Confirm
      </Button>
      {dialogOpen && (
        <Modal open={dialogOpen} setOpen={(open) => setDialogOpen(open)}>
          <Col className="bg-canvas-0 gap-4 rounded p-4 pb-8">
            <div className="text-lg font-semibold">
              Are you sure you completed your {stage} with {lover.user.name}?
            </div>
            <div>This action cannot be undone.</div>
            <div>(An innaccurate report could result in a ban.)</div>

            {error && <div className="text-red-500">{error}</div>}
            <Button
              className="font-semibold"
              color="green"
              onClick={() => submit()}
              disabled={isSubmitting}
              loading={isSubmitting}
            >
              Confirm
            </Button>
          </Col>
        </Modal>
      )}
    </>
  )
}
