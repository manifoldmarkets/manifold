import React, { Fragment } from 'react'
import { LinkIcon } from '@heroicons/react/outline'
import { Menu, Transition } from '@headlessui/react'
import clsx from 'clsx'
import { copyToClipboard } from 'web/lib/util/copy'
import { ToastClipboard } from 'web/components/widgets/toast-clipboard'
import { track } from 'web/lib/service/analytics'
import { Row } from '../layout/row'

export function CopyLinkButton(props: {
  url: string
  displayUrl?: string
  tracking?: string
  buttonClassName?: string
  toastClassName?: string
  icon?: React.ComponentType<{ className?: string }>
  label?: string
}) {
  const { url, displayUrl, tracking, buttonClassName, toastClassName } = props

  return (
    <Row className="w-full">
      <input
        className="block w-full rounded-none rounded-l-md border-gray-300 text-gray-400 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
        readOnly
        type="text"
        value={displayUrl ?? url}
        onFocus={(e) => e.target.select()}
      />

      <Menu
        as="div"
        className="relative z-10 flex-shrink-0"
        onMouseUp={() => {
          copyToClipboard(url)
          track(tracking ?? 'copy share link')
        }}
      >
        <Menu.Button
          className={clsx(
            'relative -ml-px inline-flex items-center space-x-2 rounded-r-md border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500',
            buttonClassName
          )}
        >
          <LinkIcon className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Copy link
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
          <Menu.Items>
            <Menu.Item>
              <ToastClipboard className={toastClassName} />
            </Menu.Item>
          </Menu.Items>
        </Transition>
      </Menu>
    </Row>
  )
}
