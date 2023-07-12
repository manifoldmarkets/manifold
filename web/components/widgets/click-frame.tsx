import clsx from 'clsx'
import { MouseEventHandler } from 'react'

/**
 *  A clickable container that can include buttons and links that work like you want.
 *  You can even put ClickFrames inside ClickFrames.
 */
export const ClickFrame = (props: {
  children: React.ReactNode
  onClick: MouseEventHandler<HTMLDivElement>
  className?: string
}) => {
  const { children, onClick, className } = props

  return (
    <div
      className={clsx('stop-prop', className)}
      tabIndex={-1}
      onClick={onClick}
    >
      <div
        // pointer-events:none causes click events to fall through to parent.
        // we put pointer-events:auto on links, buttons, and elements with class stop-prop,
        // so they get caught by the stopPropagation below
        className="pointer-events-none contents [&_a]:pointer-events-auto [&_button]:pointer-events-auto [&_.stop-prop]:pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
