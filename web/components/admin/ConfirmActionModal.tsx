import { useState } from 'react'
import { Modal } from '../layout/modal'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Button } from '../buttons/button'
import { Input } from '../widgets/input'

export function ConfirmActionModal(props: {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string | React.ReactNode
  confirmationWord: string
  confirmButtonText: string
  confirmButtonColor?: 'green' | 'red' | 'amber'
  isSubmitting?: boolean
}) {
  const {
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    confirmationWord,
    confirmButtonText,
    confirmButtonColor = 'red',
    isSubmitting,
  } = props

  const [inputValue, setInputValue] = useState('')

  const handleConfirm = () => {
    if (inputValue === confirmationWord) {
      onConfirm()
      setInputValue('')
    }
  }

  const handleClose = () => {
    setInputValue('')
    onClose()
  }

  return (
    <Modal open={isOpen} setOpen={handleClose} size="md">
      <Col className="bg-canvas-0 text-ink-1000 gap-4 rounded-md p-6">
        <h2 className="text-xl font-semibold">{title}</h2>

        <div className="text-ink-700 text-sm">{description}</div>

        <div>
          <label className="text-ink-700 mb-2 block text-sm font-medium">
            Type "{confirmationWord}" to confirm:
          </label>
          <Input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={confirmationWord}
            className="w-full"
            disabled={isSubmitting}
          />
        </div>

        <Row className="gap-3">
          <Button
            color={confirmButtonColor}
            onClick={handleConfirm}
            disabled={inputValue !== confirmationWord || isSubmitting}
            loading={isSubmitting}
          >
            {confirmButtonText}
          </Button>
          <Button color="gray" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
        </Row>
      </Col>
    </Modal>
  )
}
