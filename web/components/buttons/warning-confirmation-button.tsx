import clsx from 'clsx'
import React, { ReactNode } from 'react'
import { ExclamationIcon } from '@heroicons/react/solid'

import { Row } from '../layout/row'
import { ConfirmationButton } from './confirmation-button'
import { Button, ColorType, SizeType } from './button'
import { FormattedMana } from '../mana'

export function WarningConfirmationButton(props: {
  amount: number | undefined
  marketType: 'freeResponse' | 'binary'
  warning?: string | ReactNode
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

  const buttonText = isSubmitting ? (
    'Submitting...'
  ) : amount ? (
    <span>
      {actionLabel} <FormattedMana amount={amount} />
    </span>
  ) : (
    actionLabel
  )

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
