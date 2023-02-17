import React from 'react'
import { CodeIcon } from '@heroicons/react/outline'
import toast from 'react-hot-toast'

import { Contract } from 'common/contract'
import { contractPath } from 'web/lib/firebase/contracts'
import { BASE_URL } from 'common/envs/constants'
import { copyToClipboard } from 'web/lib/util/copy'
import { track } from 'web/lib/service/analytics'
import { Button } from './button'
import clsx from 'clsx'

export function embedContractCode(contract: Contract) {
  const title = contract.question
  const src = `${BASE_URL}/embed${contractPath(contract)}`
  return `<iframe src="${src}" title="${title}" frameborder="0" width="600" height="300"></iframe>`
}

export function ShareEmbedButton(props: {
  contract: Contract
  className?: string
}) {
  const { contract, className } = props

  const codeIcon = <CodeIcon className="h-4 w-4" aria-hidden />

  return (
    <Button
      size="2xs"
      color="gray-outline"
      className={clsx('gap-1', className)}
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
