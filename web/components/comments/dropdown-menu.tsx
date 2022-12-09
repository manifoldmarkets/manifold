import { Fragment, ReactNode } from 'react'
import { Menu, Transition } from '@headlessui/react'
import clsx from 'clsx'
import { DotsHorizontalIcon } from '@heroicons/react/solid'
import { Row } from 'web/components/layout/row'

export default function DropdownMenu(props: {
  Items: { name: string; icon: ReactNode; onClick: () => void }[]
  Icon?: ReactNode
  MenuWidth?: string
}) {
  const { Items, Icon, MenuWidth } = props
  const icon = Icon ?? (
    <DotsHorizontalIcon className="h-5 w-5" aria-hidden="true" />
  )
  return (
    <Menu as="div" className="relative inline-block text-left">
      <div>
        <Menu.Button className="flex items-center rounded-full text-gray-400 hover:text-gray-600">
          <span className="sr-only">Open options</span>
          {icon}
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
        <Menu.Items
          className={clsx(
            'absolute right-0 z-10 mt-2 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none',
            MenuWidth ?? 'w-32'
          )}
        >
          <div className="py-1">
            {Items.map((item) => (
              <Menu.Item key={item.name}>
                {({ active }) => (
                  <button
                    onClick={item.onClick}
                    className={clsx(
                      active ? 'bg-gray-100 text-gray-900' : 'text-gray-700',
                      'z-20 block w-full px-4 py-2 text-sm'
                    )}
                  >
                    <Row className={'gap-2'}>
                      <div className="w-5">{item.icon}</div>
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
