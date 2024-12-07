import {
  Popover,
  PopoverButton,
  PopoverPanel,
  type PopoverPanelProps,
  Transition,
} from '@headlessui/react'
import clsx from 'clsx'
import { Fragment, ReactNode } from 'react'

export type AnchorProps = NonNullable<PopoverPanelProps['anchor']>

export function CustomizeableDropdown(props: {
  menuWidth?: string
  buttonContent: React.ReactNode | ((open: boolean) => React.ReactNode)
  dropdownMenuContent:
    | React.ReactNode
    | ((close: () => void) => React.ReactNode)
  anchor?: AnchorProps
  buttonClass?: string
  className?: string
  buttonDisabled?: boolean
  closeOnClick?: boolean
  withinOverflowContainer?: boolean
  popoverClassName?: string
}) {
  const {
    menuWidth,
    buttonContent,
    dropdownMenuContent,
    anchor,
    buttonClass,
    className,
    buttonDisabled,
    withinOverflowContainer,
    popoverClassName,
  } = props

  return (
    <Popover className={clsx('relative inline-block text-left', className)}>
      {({ open, close }) => (
        <>
          <PopoverButton
            className={clsx('flex items-center', buttonClass)}
            onClick={(e: any) => {
              e.stopPropagation()
            }}
            disabled={buttonDisabled}
          >
            {typeof buttonContent === 'function'
              ? buttonContent(open)
              : buttonContent}
          </PopoverButton>

          <AnimationOrNothing show={open} animate={!withinOverflowContainer}>
            <PopoverPanel
              anchor={anchor ?? 'bottom'}
              className={clsx(
                'bg-canvas-0 ring-ink-1000 absolute z-30 rounded-md shadow-lg ring-1 ring-opacity-5 focus:outline-none',
                menuWidth ?? 'w-36',
                popoverClassName
              )}
            >
              {typeof dropdownMenuContent === 'function'
                ? dropdownMenuContent(close)
                : dropdownMenuContent}
            </PopoverPanel>
          </AnimationOrNothing>
        </>
      )}
    </Popover>
  )
}

export const AnimationOrNothing = (props: {
  animate: boolean
  show: boolean
  children: ReactNode
}) => {
  return props.animate ? (
    <Transition
      as={Fragment}
      enter="transition ease-out duration-100"
      enterFrom="transform opacity-0 scale-95"
      enterTo="transform opacity-100 scale-100"
      leave="transition ease-in duration-75"
      leaveFrom="transform opacity-100 scale-100"
      leaveTo="transform opacity-0 scale-95"
      show={props.show}
    >
      {props.children}
    </Transition>
  ) : (
    <>{props.children}</>
  )
}
