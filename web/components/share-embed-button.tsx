import { Fragment } from 'react'
import { CodeIcon } from '@heroicons/react/outline'
import { Menu, Transition } from '@headlessui/react'
import { Contract } from '../../common/contract'
import { contractPath } from '../lib/firebase/contracts'
import { DOMAIN } from '../../common/envs/constants'
import { copyToClipboard } from '../lib/util/copy'

export function ShareEmbedButton(props: { contract: Contract }) {
  const { contract } = props

  const copyEmbed = () => {
    const title = contract.question
    const src = `https://${DOMAIN}/embed${contractPath(contract)}`

    const embedCode = `<iframe width="560" height="405" src="${src}" title="${title}" frameborder="0"></iframe>`

    copyToClipboard(embedCode)
  }

  return (
    <Menu
      as="div"
      className="relative z-40 flex-shrink-0"
      onMouseUp={copyEmbed}
    >
      <Menu.Button
        className="btn btn-xs normal-case"
        style={{
          backgroundColor: 'white',
          border: '2px solid #9ca3af',
          color: '#9ca3af', // text-gray-400
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
        <Menu.Items className="origin-top-center absolute left-0 mt-2 w-40 rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          <Menu.Item>
            <div className="px-2 py-1">Embed code copied!</div>
          </Menu.Item>
        </Menu.Items>
      </Transition>
    </Menu>
  )
}
