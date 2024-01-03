import clsx from 'clsx'

import { MouseEventHandler, forwardRef } from 'react'

export const ShadowFrame = forwardRef(
  (
    props: {
      children: React.ReactNode
      onClick: MouseEventHandler<HTMLDivElement>
      className?: string
    },
    ref: React.Ref<HTMLDivElement>
  ) => {
    const { children, onClick, className } = props

    return (
      <div
        className={clsx(
          'stop-prop cursor-pointer transition-all',
          className,
          'shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]'
        )}
        tabIndex={-1}
        onClick={onClick}
        ref={ref}
      >
        <div
          // pointer-events:none causes click events to fall through to parent.
          // we put pointer-events:auto on links, buttons, and elements with class stop-prop,
          // so they get caught by the stopPropagation below
          className={clsx(
            'pointer-events-none relative contents [&_.stop-prop]:pointer-events-auto [&_a]:pointer-events-auto [&_button]:pointer-events-auto '
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    )
  }
)
