import clsx from 'clsx'
import { ReactNode, useState } from 'react'
import { Button, ColorType, SizeType } from './button'
import { Col } from './layout/col'
import { Modal } from './layout/modal'
import { Row } from './layout/row'

export function ConfirmationButton(props: {
  openModalBtn: {
    label: string
    icon?: JSX.Element
    className?: string
    color?: ColorType
    size?: SizeType
    disabled?: boolean
  }
  cancelBtn?: {
    label?: string
    className?: string
  }
  submitBtn?: {
    label?: string
    className?: string
  }
  children: ReactNode
  onSubmit?: () => void
  onOpenChanged?: (isOpen: boolean) => void
  onSubmitWithSuccess?: () => Promise<boolean>
  disabled?: boolean
}) {
  const {
    openModalBtn,
    cancelBtn,
    submitBtn,
    onSubmit,
    children,
    onOpenChanged,
    onSubmitWithSuccess,
    disabled,
  } = props

  const [open, setOpen] = useState(false)

  function updateOpen(newOpen: boolean) {
    onOpenChanged?.(newOpen)
    setOpen(newOpen)
  }

  return (
    <>
      <Modal open={open} setOpen={updateOpen}>
        <Col className="gap-4 rounded-md bg-white px-8 py-6">
          {children}
          <Row className="gap-4">
            <div
              className={clsx('btn', cancelBtn?.className)}
              onClick={() => updateOpen(false)}
            >
              {cancelBtn?.label ?? 'Cancel'}
            </div>
            <div
              className={clsx('btn', submitBtn?.className)}
              onClick={
                onSubmitWithSuccess
                  ? () =>
                      onSubmitWithSuccess().then((success) =>
                        updateOpen(!success)
                      )
                  : onSubmit
              }
            >
              {submitBtn?.label ?? 'Submit'}
            </div>
          </Row>
        </Col>
      </Modal>

      <Button
        className={clsx(openModalBtn.className)}
        onClick={() => {
          if (disabled) {
            return
          }
          updateOpen(true)
        }}
        disabled={openModalBtn.disabled}
        color={openModalBtn.color}
        size={openModalBtn.size}
      >
        {openModalBtn.icon}
        {openModalBtn.label}
      </Button>
    </>
  )
}

export function ResolveConfirmationButton(props: {
  onResolve: () => void
  isSubmitting: boolean
  openModalButtonClass?: string
  submitButtonClass?: string
  color?: ColorType
  disabled?: boolean
}) {
  const {
    onResolve,
    isSubmitting,
    openModalButtonClass,
    submitButtonClass,
    color,
    disabled,
  } = props
  return (
    <ConfirmationButton
      openModalBtn={{
        className: clsx('border-none self-start', openModalButtonClass),
        label: 'Resolve',
        color: color,
        disabled: isSubmitting || disabled,
        size: 'xl',
      }}
      cancelBtn={{
        label: 'Back',
      }}
      submitBtn={{
        label: 'Resolve',
        className: clsx('border-none', submitButtonClass),
      }}
      onSubmit={onResolve}
    >
      <p>Are you sure you want to resolve this market?</p>
    </ConfirmationButton>
  )
}
