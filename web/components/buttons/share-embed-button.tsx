import React from 'react'
import { CodeIcon } from '@heroicons/react/outline'
import toast from 'react-hot-toast'

import { Contract } from 'common/contract'
import { contractPath } from 'web/lib/firebase/contracts'
import { DOMAIN } from 'common/envs/constants'
import { copyToClipboard } from 'web/lib/util/copy'
import { track } from 'web/lib/service/analytics'
import { Button } from './button'

export function embedContractCode(contract: Contract) {
  const title = contract.question
  const src = `https://${DOMAIN}/embed${contractPath(contract)}`
  return `<iframe src="${src}" title="${title}" frameborder="0"></iframe>`
}

export function ShareEmbedButton(props: { contract: Contract }) {
  const { contract } = props

  const codeIcon = <CodeIcon className="h-4 w-4" aria-hidden />

  return (
    <Button
      size="2xs"
      color="gray-outline"
      className="gap-1"
      onClick={() => {
        copyToClipboard(embedContractCode(contract))
        toast.success('Embed code copied!', { icon: codeIcon })
        track('copy embed code')
      }}
    >
      {codeIcon}
      Embed
    </Button>
  )
}
