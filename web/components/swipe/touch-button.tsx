import clsx from 'clsx'
import { ReactNode } from 'react'

const touchButtonColors = {
  'white-icon': 'transition-colors text-white',
}
type colorType = 'white-icon'

export function TouchButton(props: {
  pressState: string
  setPressState: (pressState: string | undefined) => void
  children: ReactNode
  className?: string
  color?: colorType
}) {
  const {
    pressState,
    setPressState,
    children,
    className,
    color = 'white-icon',
  } = props
  return (
    <button
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
