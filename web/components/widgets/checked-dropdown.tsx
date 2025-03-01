import { CustomizeableDropdown } from './customizeable-dropdown'
import clsx from 'clsx'
import { ReactNode } from 'react'

export type CheckedDropdownItem = {
  name: string
  content: ReactNode
  onToggle: () => void | Promise<void>
  checked: boolean
}

export default function CheckedDropdownMenu(props: {
  items: CheckedDropdownItem[]
  menuWidth?: string
  buttonClass?: string
  className?: string
  menuItemsClass?: string
  buttonDisabled?: boolean
  withinOverflowContainer?: boolean
  buttonContent: (open: boolean) => ReactNode
  checkboxClassName?: string
}) {
  const {
    items,
    menuItemsClass,
    menuWidth,
    buttonClass,
    className,
    buttonDisabled,
    withinOverflowContainer,
    buttonContent,
    checkboxClassName,
  } = props

  return (
    <CustomizeableDropdown
      className={className}
      buttonClass={clsx('text-ink-500 hover:text-ink-800', buttonClass)}
      buttonDisabled={buttonDisabled}
      buttonContent={(open) => (
        <>
          <span className="sr-only">Open options</span>
          {buttonContent(open)}
        </>
      )}
      withinOverflowContainer={withinOverflowContainer}
      menuWidth={menuWidth ?? 'w-34'}
      popoverClassName={clsx(menuItemsClass, 'py-1')}
      dropdownMenuContent={items.map((item) => (
        <div key={item.name}>
          <div className={clsx(className, 'space-y-5')}>
            <div className="relative flex items-center gap-2">
              <div className="flex h-6 items-center">
                <input
                  type="checkbox"
                  className={clsx(
                    'border-ink-300 bg-canvas-0 dark:border-ink-500 text-primary-600 focus:ring-primary-500 h-4 w-4 rounded',
                    checkboxClassName
                  )}
                  checked={item.checked}
                  onChange={() => item.onToggle()}
                />
              </div>
              {item.content}
            </div>
          </div>
        </div>
      ))}
    />
  )
}
