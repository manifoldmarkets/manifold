import clsx from 'clsx'
import { ReactNode } from 'react'

const touchButtonColors = {
  'white-icon': 'transition-colors text-ink-1000',
}
type colorType = 'white-icon'

export function TouchButton(props: {
  pressState: string
  setPressState: (pressState: string | undefined) => void
  children: ReactNode
  disabled?: boolean
  className?: string
  color?: colorType
}) {
  const {
    pressState,
    setPressState,
    children,
    disabled,
    className,
    color = 'white-icon',
  } = props
  return (
    <button
      disabled={disabled}
      onTouchStartCapture={() => {
        setPressState(pressState)
      }}
      onTouchEndCapture={() => {
        setPressState(undefined)
      }}
      className={clsx(touchButtonColors[color], className)}
    >
      {children}
    </button>
  )
}
