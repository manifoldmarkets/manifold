import clsx from 'clsx'
import { KeyboardEventHandler, MouseEventHandler, forwardRef } from 'react'

/**
 *  A clickable container that can include buttons and links that work like you want.
 *  You can even put ClickFrames inside ClickFrames.
 */
export const ClickFrame = forwardRef(
  (
    props: {
      children: React.ReactNode
      onClick: MouseEventHandler<HTMLDivElement>
      className?: string
      onMouseEnter?: MouseEventHandler<HTMLDivElement>
      onMouseLeave?: MouseEventHandler<HTMLDivElement>
      role?: 'button' | 'link'
      tabIndex?: number
      ariaLabel?: string
      onKeyDown?: KeyboardEventHandler<HTMLDivElement>
    },
    ref: React.Ref<HTMLDivElement>
  ) => {
    const {
      children,
      onClick,
      className,
      onMouseEnter,
      onMouseLeave,
      role,
      tabIndex = 0,
      ariaLabel,
      onKeyDown,
    } = props
    const isKeyboardInteractive = tabIndex >= 0
    const resolvedRole = isKeyboardInteractive ? role ?? 'button' : undefined

    const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (e) => {
      if (
        e.currentTarget === e.target &&
        (e.key === 'Enter' || e.key === ' ')
      ) {
        e.preventDefault()
        onClick(e as any)
      }
      onKeyDown?.(e)
    }

    return (
      <div
        className={clsx(
          'stop-prop focus-visible:ring-primary-500 cursor-pointer focus-visible:ring-2',
          className
        )}
        role={resolvedRole}
        aria-label={ariaLabel}
        tabIndex={tabIndex}
        onClick={onClick}
        onKeyDown={isKeyboardInteractive ? handleKeyDown : onKeyDown}
        ref={ref}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <div
          // pointer-events:none causes click events to fall through to parent.
          // we put pointer-events:auto on links, buttons, and elements with class stop-prop,
          // so they get caught by the stopPropagation below
          className="pointer-events-none contents [&_.stop-prop]:pointer-events-auto [&_a]:pointer-events-auto [&_button]:pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    )
  }
)
