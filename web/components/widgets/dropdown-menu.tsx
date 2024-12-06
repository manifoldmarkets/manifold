import { DotsHorizontalIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import Link from 'next/link'
import { ReactNode } from 'react'
import { CustomizeableDropdown } from './customizeable-dropdown'

export type DropdownItem = {
  name: string
  buttonContent?: ReactNode
  icon?: ReactNode
  onClick?: () => void | Promise<void>
  isLink?: boolean
  linkProps?: React.AnchorHTMLAttributes<HTMLAnchorElement>
  className?: string
  nonButtonContent?: ReactNode
}

export default function DropdownMenu(props: {
  items: DropdownItem[]
  className?: string
  /** usually an icon */
  buttonContent?: ReactNode | ((open: boolean) => ReactNode)
  buttonDisabled?: boolean
  buttonClass?: string
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
    menuWidth,
    menuItemsClass,
    selectedItemName,
    closeOnClick,
    withinOverflowContainer,
  } = props

  return (
    <CustomizeableDropdown
      className={className}
      buttonClass={clsx('text-ink-500 hover:text-ink-800', buttonClass)}
      buttonDisabled={buttonDisabled}
      buttonContent={(open) => (
        <>
          <span className="sr-only">Open options</span>
          {!buttonContent ? (
            <DotsHorizontalIcon className="h-5 w-5" aria-hidden="true" />
          ) : typeof buttonContent === 'function' ? (
            buttonContent(open)
          ) : (
            buttonContent
          )}
        </>
      )}
      withinOverflowContainer={withinOverflowContainer}
      popoverClassName={clsx('mt-2 py-1', menuItemsClass)}
      menuWidth={menuWidth ?? 'w-34'}
      dropdownMenuContent={items.map((item) => (
        <div key={item.name}>
          {!!item.nonButtonContent ? (
            item.nonButtonContent
          ) : item.isLink && item.linkProps && item.linkProps.href ? (
            <Link
              href={item.linkProps?.href || '#'}
              {...item.linkProps}
              className={clsx(
                selectedItemName && item.name === selectedItemName
                  ? 'bg-primary-100'
                  : 'hover:bg-ink-100 hover:text-ink-900',
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
                if (closeOnClick) {
                  close()
                }
              }}
              className={clsx(
                selectedItemName && item.name === selectedItemName
                  ? 'bg-primary-100'
                  : 'hover:bg-ink-100 hover:text-ink-900',
                'text-ink-700',
                'flex w-full items-center gap-2 px-4 py-2 text-left text-sm',
                item.className
              )}
            >
              {item.icon && <div className="w-5">{item.icon}</div>}
              {item.buttonContent ?? item.name}
            </button>
          )}
        </div>
      ))}
    />
  )
}
