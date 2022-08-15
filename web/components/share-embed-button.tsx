import React from 'react'
import { CodeIcon } from '@heroicons/react/outline'
import { Menu } from '@headlessui/react'
import toast from 'react-hot-toast'

import { Contract } from 'common/contract'
import { contractPath } from 'web/lib/firebase/contracts'
import { DOMAIN } from 'common/envs/constants'
import { copyToClipboard } from 'web/lib/util/copy'
import { track } from 'web/lib/service/analytics'

export function embedCode(contract: Contract) {
  const title = contract.question
  const src = `https://${DOMAIN}/embed${contractPath(contract)}`

  return `<iframe width="560" height="405" src="${src}" title="${title}" frameborder="0"></iframe>`
}

export function ShareEmbedButton(props: { contract: Contract }) {
  const { contract } = props

  const codeIcon = <CodeIcon className="mr-1.5 h-4 w-4" aria-hidden="true" />

  return (
    <Menu
      as="div"
      className="relative z-10 flex-shrink-0"
      onMouseUp={() => {
        copyToClipboard(embedCode(contract))
        toast.success('Embed code copied!', {
          icon: codeIcon,
        })
        track('copy embed code')
      }}
    >
      <Menu.Button
        className="btn btn-xs normal-case"
        style={{
          backgroundColor: 'white',
          border: '2px solid #9ca3af',
          color: '#9ca3af', // text-gray-400
        }}
      >
        {codeIcon}
        Embed
      </Menu.Button>
    </Menu>
  )
}
