import clsx from 'clsx'
import React from 'react'

import { Row } from './layout/row'
import { ConfirmationButton } from './confirmation-button'
import { ExclamationIcon } from '@heroicons/react/solid'

export function WarningConfirmationButton(props: {
  warning?: string
  onSubmit: () => void
  disabled?: boolean
  isSubmitting: boolean
  openModalButtonClass?: string
  submitButtonClassName?: string
}) {
  const {
    onSubmit,
    warning,
    disabled,
    isSubmitting,
    openModalButtonClass,
    submitButtonClassName,
  } = props

  if (!warning) {
    return (
      <button
        className={clsx(
          openModalButtonClass,
          isSubmitting ? 'loading' : '',
          disabled && 'btn-disabled'
        )}
        onClick={onSubmit}
        disabled={disabled}
      >
        {isSubmitting ? 'Submitting...' : 'Submit'}
      </button>
    )
  }

  return (
    <ConfirmationButton
      openModalBtn={{
        className: clsx(
          openModalButtonClass,
          isSubmitting && 'btn-disabled loading'
        ),
        label: 'Submit',
      }}
      cancelBtn={{
        label: 'Cancel',
        className: 'btn-warning',
      }}
      submitBtn={{
        label: 'Submit',
        className: clsx(
          'border-none btn-sm btn-ghost self-center',
          submitButtonClassName
        ),
      }}
      onSubmit={onSubmit}
    >
      <Row className="items-center text-xl">
        <ExclamationIcon
          className="h-16 w-16 text-yellow-400"
          aria-hidden="true"
        />
        Whoa, there!
      </Row>

      <p>{warning}</p>
    </ConfirmationButton>
  )
}
