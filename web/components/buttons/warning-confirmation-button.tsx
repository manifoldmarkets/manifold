import clsx from 'clsx'
import React from 'react'
import { ExclamationIcon } from '@heroicons/react/solid'

import { Row } from '../layout/row'
import { ConfirmationButton } from './confirmation-button'
import { formatMoney } from 'common/util/format'
import { Button, ColorType, SizeType } from './button'

export function WarningConfirmationButton(props: {
  amount: number | undefined
  marketType: 'freeResponse' | 'binary'
  warning?: string
  onSubmit?: () => void
  disabled: boolean
  isSubmitting: boolean
  openModalButtonClass?: string
  color: ColorType
  size: SizeType
  actionLabel: string
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
    actionLabel,
  } = props

  const buttonText = isSubmitting
    ? 'Submitting...'
    : amount
    ? `${actionLabel} ${formatMoney(amount)}`
    : actionLabel

  if (!warning) {
    return (
      <Button
        size={size}
        disabled={isSubmitting || disabled}
        className={clsx(openModalButtonClass)}
        onClick={onSubmit}
        color={color}
      >
        {buttonText}
      </Button>
    )
  }

  return (
    <ConfirmationButton
      openModalBtn={{
        label: buttonText,
        size: size,
        color: 'yellow',
        disabled: isSubmitting || disabled,
      }}
      cancelBtn={{
        label: 'Cancel',
        color: 'yellow',
        disabled: isSubmitting,
      }}
      submitBtn={{
        label: 'Submit',
        color: 'indigo',
        isSubmitting,
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
