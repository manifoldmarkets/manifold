import clsx from 'clsx'
import React from 'react'

import { Row } from './layout/row'
import { ConfirmationButton } from './confirmation-button'
import { ExclamationIcon } from '@heroicons/react/solid'
import { formatMoney } from 'common/util/format'

export function WarningConfirmationButton(props: {
  amount: number | undefined
  outcome?: 'YES' | 'NO' | undefined
  marketType: 'freeResponse' | 'binary'
  warning?: string
  onSubmit: () => void
  disabled?: boolean
  isSubmitting: boolean
  openModalButtonClass?: string
  submitButtonClassName?: string
}) {
  const {
    amount,
    onSubmit,
    warning,
    disabled,
    isSubmitting,
    openModalButtonClass,
    submitButtonClassName,
    outcome,
    marketType,
  } = props
  if (!warning) {
    return (
      <button
        className={clsx(
          openModalButtonClass,
          isSubmitting ? 'loading btn-disabled' : '',
          disabled && 'btn-disabled',
          marketType === 'binary'
            ? !outcome
              ? 'btn-disabled bg-greyscale-2'
              : ''
            : ''
        )}
        onClick={onSubmit}
      >
        {isSubmitting
          ? 'Submitting...'
          : amount
          ? `Wager ${formatMoney(amount)}`
          : 'Wager'}
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
        label: amount ? `Wager ${formatMoney(amount)}` : 'Wager',
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
