import clsx from 'clsx'

export function ConfirmationButton(props: {
  id: string
  openModalBtn: {
    label: string
    icon?: any
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
  children: any
}) {
  const { id, openModalBtn, cancelBtn, submitBtn, onSubmit, children } = props

  return (
    <>
      <label
        htmlFor={id}
        className={clsx('btn modal-button', openModalBtn.className)}
      >
        {openModalBtn.icon} {openModalBtn.label}
      </label>
      <input type="checkbox" id={id} className="modal-toggle" />

      <div className="modal">
        <div className="modal-box whitespace-normal">
          {children}

          <div className="modal-action">
            <label htmlFor={id} className={clsx('btn', cancelBtn?.className)}>
              {cancelBtn?.label ?? 'Cancel'}
            </label>
            <label
              htmlFor={id}
              className={clsx('btn', submitBtn?.className)}
              onClick={onSubmit}
            >
              {submitBtn?.label ?? 'Submit'}
            </label>
          </div>
        </div>
      </div>
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
      id="resolution-modal"
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
