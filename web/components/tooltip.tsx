import {
  arrow,
  autoUpdate,
  flip,
  offset,
  Placement,
  shift,
  useFloating,
} from '@floating-ui/react-dom'
import clsx from 'clsx'
import { ReactNode, useRef } from 'react'

// See https://floating-ui.com/docs/react-dom

export function Tooltip(props: {
  text: string | false | undefined | null
  children: ReactNode
  className?: string
  placement?: Placement
  noTap?: boolean
}) {
  const { text, children, className, placement = 'top', noTap } = props

  const arrowRef = useRef(null)

  const { x, y, refs, reference, floating, strategy, middlewareData } =
    useFloating({
      whileElementsMounted: autoUpdate,
      placement,
      middleware: [
        offset(8),
        flip(),
        shift({ padding: 4 }),
        arrow({ element: arrowRef }),
      ],
    })

  const { x: arrowX, y: arrowY } = middlewareData.arrow ?? {}

  // which side of tooltip arrow is on. like: if tooltip is top-left, arrow is on bottom of tooltip
  const arrowSide = {
    top: 'bottom',
    right: 'left',
    bottom: 'top',
    left: 'right ',
  }[placement.split('-')[0]] as string

  return text ? (
    <div className="contents">
      <div
        className={clsx('peer inline-block', className)}
        ref={reference}
        tabIndex={noTap ? undefined : 0}
        onTouchStart={() => (refs.reference.current as HTMLElement).focus()}
      >
        {children}
      </div>
      <div
        role="tooltip"
        ref={floating}
        style={{ position: strategy, top: y ?? 0, left: x ?? 0 }}
        className="z-10 max-w-xs rounded bg-slate-700 px-2 py-1 text-center text-sm text-white opacity-0 transition-opacity peer-hover:opacity-100 peer-focus:opacity-100"
      >
        {text}
        <div
          ref={arrowRef}
          className="absolute h-2 w-2  rotate-45 bg-slate-700"
          style={{
            top: arrowY != null ? arrowY : '',
            left: arrowX != null ? arrowX : '',
            right: '',
            bottom: '',
            [arrowSide]: '-4px',
          }}
        />
      </div>
    </div>
  ) : (
    <>{children}</>
  )
}
