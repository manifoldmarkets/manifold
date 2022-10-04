import clsx from 'clsx'
import React from 'react'

import { Row } from './layout/row'
import { ConfirmationButton } from './confirmation-button'
import { ExclamationIcon } from '@heroicons/react/solid'
import { formatMoney } from 'common/util/format'
import { Button, ColorType, SizeType } from './button'

export function WarningConfirmationButton(props: {
  amount: number | undefined
  marketType: 'freeResponse' | 'binary'
  warning?: string
  onSubmit: () => void
  disabled: boolean
  isSubmitting: boolean
  openModalButtonClass?: string
  color: ColorType
  size: SizeType
}) {
  const {
    amount,
    onSubmit,
    warning,
    disabled,
    isSubmitting,
    openModalButtonClass,
    size,
    color,
  } = props

  if (!warning) {
    return (
      <Button
        size={size}
        disabled={isSubmitting || disabled}
        className={clsx(openModalButtonClass)}
        onClick={onSubmit}
        color={color}
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
      openModalBtn={{
        label: amount ? `Wager ${formatMoney(amount)}` : 'Wager',
        size: size,
        color: 'yellow',
        disabled: isSubmitting,
      }}
      cancelBtn={{
        label: 'Cancel',
        color: 'yellow',
      }}
      submitBtn={{
        label: 'Submit',
        color: 'gray',
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
