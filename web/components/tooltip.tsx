import {
  arrow,
  autoUpdate,
  flip,
  offset,
  Placement,
  shift,
  useFloating,
  useHover,
  useInteractions,
  useRole,
} from '@floating-ui/react-dom-interactions'
import { Transition } from '@headlessui/react'
import clsx from 'clsx'
import { ReactNode, useRef, useState } from 'react'

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

  const [open, setOpen] = useState(false)

  const { x, y, reference, floating, strategy, middlewareData, context } =
    useFloating({
      open,
      onOpenChange: setOpen,
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

  const { getReferenceProps, getFloatingProps } = useInteractions([
    useHover(context, { mouseOnly: noTap }),
    useRole(context, { role: 'tooltip' }),
  ])
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
        className={clsx('inline-block', className)}
        ref={reference}
        {...getReferenceProps()}
      >
        {children}
      </div>
      {/* conditionally render tooltip and fade in/out */}
      <Transition
        show={open}
        enter="transition ease-out duration-200"
        enterFrom="opacity-0 "
        enterTo="opacity-100"
        leave="transition ease-in duration-150"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
        // div attributes
        role="tooltip"
        ref={floating}
        style={{ position: strategy, top: y ?? 0, left: x ?? 0 }}
        className="z-10 max-w-xs rounded bg-slate-700 px-2 py-1 text-center text-sm text-white"
        {...getFloatingProps()}
      >
        {text}
        <div
          ref={arrowRef}
          className="absolute h-2 w-2 rotate-45 bg-slate-700"
          style={{
            top: arrowY != null ? arrowY : '',
            left: arrowX != null ? arrowX : '',
            right: '',
            bottom: '',
            [arrowSide]: '-4px',
          }}
        />
      </Transition>
    </div>
  ) : (
    <>{children}</>
  )
}
