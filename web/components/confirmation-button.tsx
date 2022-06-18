import clsx from 'clsx'
import { ReactNode, useState } from 'react'
import { Col } from './layout/col'
import { Modal } from './layout/modal'
import { Row } from './layout/row'

export function ConfirmationButton(props: {
  openModalBtn: {
    label: string
    icon?: JSX.Element
    className?: string
  }
  cancelBtn?: {
    label?: string
    className?: string
  }
  submitBtn?: {
    label?: string
    className?: string
  }
  onSubmit: () => void
  children: ReactNode
}) {
  const { openModalBtn, cancelBtn, submitBtn, onSubmit, children } = props

  const [open, setOpen] = useState(false)

  return (
    <>
      <Modal open={open} setOpen={setOpen}>
        <Col className="gap-4 rounded-md bg-white px-8 py-6">
          {children}
          <Row className="gap-4">
            <button
              className={clsx('btn', cancelBtn?.className)}
              onClick={() => setOpen(false)}
            >
              {cancelBtn?.label ?? 'Cancel'}
            </button>
            <button
              className={clsx('btn', submitBtn?.className)}
              onClick={onSubmit}
            >
              {submitBtn?.label ?? 'Submit'}
            </button>
          </Row>
        </Col>
      </Modal>
      <button
        className={clsx('btn', openModalBtn.className)}
        onClick={() => setOpen(true)}
      >
        {openModalBtn.label}
      </button>
    </>
  )
}

export function ResolveConfirmationButton(props: {
  onResolve: () => void
  isSubmitting: boolean
  openModalButtonClass?: string
  submitButtonClass?: string
}) {
  const { onResolve, isSubmitting, openModalButtonClass, submitButtonClass } =
    props
  return (
    <ConfirmationButton
      openModalBtn={{
        className: clsx(
          'border-none self-start',
          openModalButtonClass,
          isSubmitting && 'btn-disabled loading'
        ),
        label: 'Resolve',
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
