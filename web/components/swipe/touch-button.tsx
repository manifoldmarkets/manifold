import clsx from 'clsx'
import { ReactNode } from 'react'

export function TouchButton(props: {
  pressState: string
  setPressState: (pressState: string | undefined) => void
  children: ReactNode
  disabled?: boolean
  className?: string
}) {
  const { pressState, setPressState, children, disabled, className } = props
  return (
    <button
      disabled={disabled}
      onTouchStartCapture={() => {
        setPressState(pressState)
      }}
      onTouchEndCapture={() => {
        setPressState(undefined)
      }}
      className={clsx('text-ink-1000 transition-colors', className)}
    >
      {children}
    </button>
  )
}
