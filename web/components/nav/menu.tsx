import { Fragment } from 'react'
import { Menu, Transition } from '@headlessui/react'
import clsx from 'clsx'

export function MenuButton(props: {
  buttonContent: any
  menuItems: { name: string; href: string; onClick?: () => void }[]
  className?: string
}) {
  const { buttonContent, menuItems, className } = props
  return (
    <Menu as="div" className={clsx('relative z-40 flex-shrink-0', className)}>
      <div>
        <Menu.Button className="w-full rounded-full">
          <span className="sr-only">Open user menu</span>
          {buttonContent}
        </Menu.Button>
      </div>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items className="absolute right-0 mt-2 w-40 origin-top-right rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          {menuItems.map((item) => (
            <Menu.Item key={item.name}>
              {({ active }) => (
                <a
                  href={item.href}
                  target={item.href.startsWith('http') ? '_blank' : undefined}
                  onClick={item.onClick}
                  className={clsx(
                    active ? 'bg-gray-100' : '',
                    'block py-2 px-4 text-sm text-gray-700'
                  )}
                >
                  {item.name}
                </a>
              )}
            </Menu.Item>
          ))}
        </Menu.Items>
      </Transition>
    </Menu>
  )
}
