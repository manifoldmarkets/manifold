import clsx from 'clsx'
import { ExclamationIcon } from '@heroicons/react/solid'

import { Row } from '../layout/row'
import { ConfirmationButton } from './confirmation-button'
import { Button, ColorType, SizeType } from './button'
import { Ref, useEffect, useState } from 'react'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { BOTTOM_NAV_BAR_HEIGHT } from 'web/components/nav/bottom-nav-bar'

export function WarningConfirmationButton(props: {
  amount: number | undefined
  marketType: 'freeResponse' | 'binary'
  warning?: string
  onSubmit?: () => void
  disabled: boolean
  isSubmitting: boolean
  actionLabelClassName?: string
  ButtonClassName?: string
  color: ColorType
  size: SizeType
  actionLabel: string
  userOptedOutOfWarning: boolean | undefined
  inModal: boolean
}) {
  const {
    amount,
    onSubmit,
    warning,
    disabled,
    isSubmitting,
    actionLabelClassName,
    ButtonClassName,
    size,
    color,
    actionLabel,
    userOptedOutOfWarning,
    inModal,
  } = props

  const [isBetButtonVisible, setIsBetButtonVisible] = useState(false)
  const { ref: betButtonRef } = useIsVisible(() => setIsBetButtonVisible(true))
  useEffect(() => {
    if (isBetButtonVisible || !betButtonRef.current || inModal) return
    const rect = betButtonRef.current.getBoundingClientRect()
    const buttonBottomPosition = rect.bottom
    const windowHeight = window.innerHeight

    if (buttonBottomPosition > windowHeight) {
      window.scrollTo({
        top: buttonBottomPosition - windowHeight + BOTTOM_NAV_BAR_HEIGHT,
        behavior: 'smooth',
      })
    }
  }, [actionLabel])

  const buttonText = isSubmitting
    ? 'Submitting...'
    : amount && !disabled
    ? `${actionLabel}`
    : disabled && !amount
    ? 'Enter an amount'
    : actionLabel

  if (!warning || userOptedOutOfWarning) {
    return (
      <Button
        size={size}
        disabled={isSubmitting || disabled}
        onClick={onSubmit}
        color={color}
        ref={betButtonRef as Ref<HTMLButtonElement>}
        className={clsx(ButtonClassName)}
      >
        <span className={clsx(actionLabelClassName)}>{buttonText}</span>
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
