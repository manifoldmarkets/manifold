import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  type MenuItemsProps,
} from '@headlessui/react'
import { DotsHorizontalIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import Link from 'next/link'
import { Fragment, ReactNode } from 'react'
import { AnimationOrNothing } from './customizeable-dropdown'

type AnchorProps = NonNullable<MenuItemsProps['anchor']>

export type DropdownItem = {
  name: string
  buttonContent?: ReactNode
  icon?: ReactNode
  onClick?: () => void | Promise<void>
  isLink?: boolean
  linkProps?: React.AnchorHTMLAttributes<HTMLAnchorElement>
  className?: string
  nonButtonContent?: ReactNode
  closeOnClick?: boolean
}

export default function DropdownMenu(props: {
  items: DropdownItem[]
  className?: string
  /** usually an icon */
  buttonContent?: ReactNode | ((open: boolean) => ReactNode)
  buttonDisabled?: boolean
  buttonClass?: string
  anchor?: AnchorProps
  menuWidth?: string
  menuItemsClass?: string
  selectedItemName?: string
  closeOnClick?: boolean
  withinOverflowContainer?: boolean
}) {
  const {
    items,
    className,
    buttonContent,
    buttonDisabled,
    buttonClass,
    anchor,
    menuWidth,
    menuItemsClass,
    selectedItemName,
    closeOnClick,
    withinOverflowContainer,
  } = props
  return (
    <Menu
      as="div"
      className={clsx('relative inline-block text-left', className)}
    >
      {({ open, close }) => (
        <>
          <MenuButton
            className={clsx(
              'text-ink-500 hover:text-ink-800 flex items-center',
              buttonClass
            )}
            disabled={buttonDisabled}
          >
            <span className="sr-only">Open options</span>
            {!buttonContent ? (
              <DotsHorizontalIcon className="h-5 w-5" aria-hidden="true" />
            ) : typeof buttonContent === 'function' ? (
              buttonContent(open)
            ) : (
              buttonContent
            )}
          </MenuButton>
          <AnimationOrNothing show={open} animate={!withinOverflowContainer}>
            <MenuItems
              anchor={anchor ?? { to: 'bottom', gap: 8, padding: 4 }}
              className={clsx(
                'bg-canvas-0 ring-ink-1000 absolute z-30 rounded-md py-1 shadow-lg ring-1 ring-opacity-5 focus:outline-none',
                menuWidth ?? 'w-34',
                menuItemsClass
              )}
            >
              {items.map((item) =>
                !!item.nonButtonContent ? (
                  <Fragment key={item.name}>{item.nonButtonContent}</Fragment>
                ) : (
                  <MenuItem key={item.name}>
                    {item.isLink && item.linkProps && item.linkProps.href ? (
                      <Link
                        href={item.linkProps?.href || '#'}
                        {...item.linkProps}
                        className={clsx(
                          selectedItemName && item.name === selectedItemName
                            ? 'bg-primary-100'
                            : 'data-[focus]:bg-ink-100 data-[focus]:text-ink-900',
                          'text-ink-700',
                          'flex w-full items-center gap-2 px-4 py-2 text-left text-sm'
                        )}
                      >
                        {item.icon && <div className="w-5">{item.icon}</div>}
                        {item.buttonContent ?? item.name}
                      </Link>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                          if (item.onClick) {
                            item.onClick()
                          }
                          if (closeOnClick || item.closeOnClick) {
                            close()
                          }
                        }}
                        className={clsx(
                          selectedItemName && item.name === selectedItemName
                            ? 'bg-primary-100'
                            : 'data-[focus]:bg-ink-100 data-[focus]:text-ink-900',
                          'text-ink-700',
                          'flex w-full items-center gap-2 px-4 py-2 text-left text-sm',
                          item.className
                        )}
                      >
                        {item.icon && <div className="w-5">{item.icon}</div>}
                        {item.buttonContent ?? item.name}
                      </button>
                    )}
                  </MenuItem>
                )
              )}
            </MenuItems>
          </AnimationOrNothing>
        </>
      )}
    </Menu>
  )
}
