import { Menu, Transition } from '@headlessui/react'
import { DotsHorizontalIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Fragment, ReactNode } from 'react'
import { Row } from 'web/components/layout/row'

export type DropdownItem = {
  name: string
  icon?: ReactNode
  onClick: () => void | Promise<void>
}

export default function DropdownMenu(props: {
  Items: DropdownItem[]
  Icon?: ReactNode
  menuWidth?: string
  buttonClass?: string
  className?: string
  menuItemsClass?: string
  buttonDisabled?: boolean
}) {
  const {
    Items,
    menuItemsClass,
    Icon,
    menuWidth,
    buttonClass,
    className,
    buttonDisabled,
  } = props
  const icon = Icon ?? (
    <DotsHorizontalIcon className="h-5 w-5" aria-hidden="true" />
  )
  return (
    <Menu
      as="div"
      className={clsx('relative inline-block text-left', className)}
    >
      <Menu.Button
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
      </Menu.Button>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items
          className={clsx(
            'bg-canvas-0 ring-ink-1000 absolute right-0 z-30 mt-2 origin-top-right rounded-md shadow-lg ring-1 ring-opacity-5 focus:outline-none',
            menuWidth ?? 'w-34',
            menuItemsClass
          )}
        >
          <div className="py-1">
            {Items.map((item) => (
              <Menu.Item key={item.name}>
                {({ active }) => (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      item.onClick()
                    }}
                    className={clsx(
                      active ? 'bg-ink-100 text-ink-900' : 'text-ink-700',
                      'block w-full px-4 py-2 text-sm'
                    )}
                  >
                    <Row className={'gap-2'}>
                      {item.icon && <div className="w-5">{item.icon}</div>}
                      <div className="text-left">{item.name}</div>
                    </Row>
                  </button>
                )}
              </Menu.Item>
            ))}
          </div>
        </Menu.Items>
      </Transition>
    </Menu>
  )
}
