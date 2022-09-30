import clsx from 'clsx'
import React from 'react'

import { Row } from './layout/row'
import { ConfirmationButton } from './confirmation-button'
import { ExclamationIcon } from '@heroicons/react/solid'
import { formatMoney } from 'common/util/format'
import { Button, SizeType } from './button'

export function WarningConfirmationButton(props: {
  amount: number | undefined
  outcome?: 'YES' | 'NO' | undefined
  marketType: 'freeResponse' | 'binary'
  warning?: string
  onSubmit: () => void
  disabled: boolean
  isSubmitting: boolean
  openModalButtonClass?: string
  submitButtonClassName?: string
  size: SizeType
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
    size,
  } = props

  if (!warning) {
    return (
      <Button
        size={size}
        disabled={isSubmitting || disabled}
        className={clsx(openModalButtonClass, isSubmitting ? 'loading' : '')}
        onClick={onSubmit}
        color={outcome === 'NO' ? 'red' : 'green'}
      >
        {isSubmitting
          ? 'Submitting...'
          : amount
          ? `Wager ${formatMoney(amount)}`
          : 'Wager'}
      </Button>
    )
  }

  return (
    <ConfirmationButton
      disabled={isSubmitting}
      openModalBtn={{
        className: clsx(isSubmitting && 'loading'),
        label: amount ? `Wager ${formatMoney(amount)}` : 'Wager',
      }}
      cancelBtn={{
        label: 'Cancel',
        className: 'btn btn-warning',
      }}
      submitBtn={{
        label: 'Submit',
        className: clsx('btn border-none btn-sm btn-ghost self-center'),
      }}
      onSubmit={onSubmit}
      size={size}
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
