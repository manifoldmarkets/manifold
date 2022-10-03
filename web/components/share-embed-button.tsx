import React from 'react'
import { CodeIcon } from '@heroicons/react/outline'
import { Menu } from '@headlessui/react'
import toast from 'react-hot-toast'

import { Contract } from 'common/contract'
import { contractPath } from 'web/lib/firebase/contracts'
import { DOMAIN } from 'common/envs/constants'
import { copyToClipboard } from 'web/lib/util/copy'
import { track } from 'web/lib/service/analytics'

export function embedContractCode(contract: Contract) {
  const title = contract.question
  const src = `https://${DOMAIN}/embed${contractPath(contract)}`
  return `<iframe src="${src}" title="${title}"></iframe>`
}

export function embedContractGridCode(contracts: Contract[]) {
  const height = (contracts.length - (contracts.length % 2)) * 100 + 'px'
  const src = `https://${DOMAIN}/embed/grid/${contracts
    .map((c) => c.slug)
    .join('/')}`
  return `<iframe height="${height}" src="${src}" title="Grid of contracts" frameborder="0"></iframe>`
}

export function ShareEmbedButton(props: { contract: Contract }) {
  const { contract } = props

  const codeIcon = <CodeIcon className="mr-1.5 h-4 w-4" aria-hidden="true" />

  return (
    <Menu
      as="div"
      className="relative z-10 flex-shrink-0"
      onMouseUp={() => {
        copyToClipboard(embedContractCode(contract))
        toast.success('Embed code copied!', {
          icon: codeIcon,
        })
        track('copy embed code')
      }}
    >
      <Menu.Button className="btn btn-xs border-2 !border-gray-500 !bg-white normal-case text-gray-500">
        {codeIcon}
        Embed
      </Menu.Button>
    </Menu>
  )
}
