import { DotsHorizontalIcon } from '@heroicons/react/solid'
import { Fragment, ReactNode, useState } from 'react'
import { usePopper } from 'react-popper'
import { Popover, Transition } from '@headlessui/react'
import clsx from 'clsx'

export type DropdownItem = {
  name: string
  icon?: ReactNode
  onClick: () => void | Promise<void>
}

// NOTE: you can't conditionally render any of the items from a useEffect hook, or you'll get hydration errors
export default function DropdownMenu(props: {
  items: DropdownItem[]
  icon?: ReactNode
  menuWidth?: string
  buttonClass?: string
  className?: string
  menuItemsClass?: string
  buttonDisabled?: boolean
  selectedItemName?: string
  closeOnClick?: boolean
  withinOverflowContainer?: boolean
}) {
  const {
    items,
    menuItemsClass,
    menuWidth,
    buttonClass,
    className,
    buttonDisabled,
    selectedItemName,
    closeOnClick,
    withinOverflowContainer,
  } = props
  const [referenceElement, setReferenceElement] =
    useState<HTMLButtonElement | null>()
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>()
  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    strategy: withinOverflowContainer ? 'fixed' : 'absolute',
  })
  const icon = props.icon ?? (
    <DotsHorizontalIcon className="h-5 w-5" aria-hidden="true" />
  )
  return (
    <Popover className={clsx('relative inline-block text-left', className)}>
      {({ open, close }) => (
        <>
          <Popover.Button
            ref={setReferenceElement}
            className={clsx(
              'text-ink-400 hover:text-ink-600 flex items-center',
              buttonClass
            )}
            onClick={(e: any) => {
              e.stopPropagation()
            }}
            disabled={buttonDisabled}
          >
            <span className="sr-only">Open options</span>
            {icon}
          </Popover.Button>

          <AnimationOrNothing show={open} animate={!withinOverflowContainer}>
            <Popover.Panel
              ref={setPopperElement}
              style={styles.popper}
              {...attributes.popper}
              className={clsx(
                'bg-canvas-0 ring-ink-1000  z-30 mt-2 rounded-md shadow-lg ring-1 ring-opacity-5 focus:outline-none',
                menuWidth ?? 'w-34',
                menuItemsClass,
                'py-1'
              )}
            >
              {items.map((item) => (
                <div key={item.name}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      item.onClick()
                      if (closeOnClick) {
                        close()
                      }
                    }}
                    className={clsx(
                      selectedItemName && item.name == selectedItemName
                        ? 'bg-primary-100'
                        : 'hover:bg-ink-100 hover:text-ink-900',
                      'text-ink-700',
                      'flex w-full gap-2 px-4 py-2 text-left text-sm'
                    )}
                  >
                    {item.icon && <div className="w-5">{item.icon}</div>}
                    {item.name}
                  </button>
                </div>
              ))}
            </Popover.Panel>
          </AnimationOrNothing>
        </>
      )}
    </Popover>
  )
}
const AnimationOrNothing = (props: {
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
