import clsx from 'clsx'

export function ConfirmationModal(props: {
  id: string
  openModelBtn: {
    label: string
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
  const { id, openModelBtn, cancelBtn, submitBtn, onSubmit, children } = props

  return (
    <>
      <label
        htmlFor={id}
        className={clsx('btn modal-button', openModelBtn.className)}
      >
        {openModelBtn.label}
      </label>
      <input type="checkbox" id={id} className="modal-toggle" />

      <div className="modal">
        <div className="modal-box">
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
