import React, { Fragment } from 'react'
import { CodeIcon } from '@heroicons/react/outline'
import { Menu, Transition } from '@headlessui/react'
import { Contract } from 'common/contract'
import { contractPath } from 'web/lib/firebase/contracts'
import { DOMAIN } from 'common/envs/constants'
import { copyToClipboard } from 'web/lib/util/copy'
import { ToastClipboard } from 'web/components/toast-clipboard'

function copyEmbedCode(contract: Contract) {
  const title = contract.question
  const src = `https://${DOMAIN}/embed${contractPath(contract)}`

  const embedCode = `<iframe width="560" height="405" src="${src}" title="${title}" frameborder="0"></iframe>`

  copyToClipboard(embedCode)
}

export function ShareEmbedButton(props: {
  contract: Contract
  toastClassName?: string
}) {
  const { contract, toastClassName } = props

  return (
    <Menu
      as="div"
      className="relative z-10 flex-shrink-0"
      onMouseUp={() => copyEmbedCode(contract)}
    >
      <Menu.Button
        className="btn btn-xs normal-case"
        style={{
          backgroundColor: 'white',
          border: '2px solid #9ca3af',
          color: '#9ca3af', // text-gray-400 dark:text-gray-600
        }}
      >
        <CodeIcon className="mr-1.5 h-4 w-4" aria-hidden="true" />
        Embed
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
