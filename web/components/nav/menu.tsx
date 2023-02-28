import React, { Fragment } from 'react'
import { Menu, Transition } from '@headlessui/react'
import clsx from 'clsx'

export type MenuItem = {
  name: string
  href?: string
  onClick?: () => void
}

export function MenuButton(props: {
  buttonContent: JSX.Element
  menuItems: MenuItem[]
  className?: string
}) {
  const { buttonContent, menuItems, className } = props
  return (
    <Menu
      as="div"
      className={clsx(className ? className : 'relative z-40 flex-shrink-0')}
    >
      <Menu.Button className="w-full rounded-full">
        <span className="sr-only">Open user menu</span>
        {buttonContent}
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
        <Menu.Items className="bg-canvas-0 ring-ink-1000 absolute left-0 mt-2 w-40 origin-top-right rounded-md py-1 shadow-lg ring-1 ring-opacity-5 focus:outline-none">
          {menuItems.map((item) => (
            <Menu.Item key={item.href || item.name}>
              {({ active }) => (
                <a
                  href={item.href}
                  target={item.href?.startsWith('http') ? '_blank' : undefined}
                  onClick={item.onClick}
                  className={clsx(
                    active ? 'bg-ink-100' : '',
                    'line-clamp-3 text-ink-700 block cursor-pointer py-1.5 px-4 text-sm'
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
