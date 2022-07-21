import React, { Fragment, useEffect } from 'react'
import { LinkIcon } from '@heroicons/react/outline'
import { Menu, Transition } from '@headlessui/react'
import clsx from 'clsx'
import { ToastClipboard } from 'web/components/toast-clipboard'
import { copyToClipboard } from 'web/lib/util/copy'

export function CopyLinkButton(props: {
  link: string
  onCopy?: () => void
  buttonClassName?: string
  toastClassName?: string
  icon?: React.ComponentType<{ className?: string }>
  label?: string
}) {
  const { onCopy, link, buttonClassName, toastClassName, label } = props

  return (
    <Menu
      as="div"
      className="relative z-10 flex-shrink-0"
      onMouseUp={() => {
        copyToClipboard(link)
        onCopy?.()
      }}
    >
      <Menu.Button
        className={clsx(
          'btn btn-xs border-2 border-green-600 bg-white normal-case text-green-600 hover:border-green-600 hover:bg-white',
          buttonClassName
        )}
      >
        {!props.icon && (
          <LinkIcon className="mr-1.5 h-4 w-4" aria-hidden="true" />
        )}
        {props.icon && <props.icon className={'h-4 w-4'} />}
        {label ?? 'Copy link'}
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
  )
}
