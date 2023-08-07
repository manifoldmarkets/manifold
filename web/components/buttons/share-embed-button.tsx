import { CodeIcon } from '@heroicons/react/outline'
import toast from 'react-hot-toast'

import { Contract, contractPath } from 'common/contract'
import { DOMAIN } from 'common/envs/constants'
import { copyToClipboard } from 'web/lib/util/copy'
import { track } from 'web/lib/service/analytics'
import { Button } from './button'
import clsx from 'clsx'

export function embedContractCode(contract: Contract) {
  const title = contract.question
  const src = `https://${DOMAIN}/embed${contractPath(contract)}`
  return `<iframe src="${src}" title="${title}" frameborder="0" width="600" height="300"></iframe>`
}

// TODO: move this function elsewhere
export function embedContractGridCode(contracts: Contract[]) {
  const height = (contracts.length - (contracts.length % 2)) * 100 + 'px'
  const src = `https://${DOMAIN}/embed/grid/${contracts
    .map((c) => c.slug)
    .join('/')}`
  return `<iframe height="${height}" src="${src}" title="Grid of contracts" frameborder="0"></iframe>`
}

export function ShareEmbedButton(props: {
  contract: Contract
  className?: string
}) {
  const { contract, className } = props

  const codeIcon = <CodeIcon className="h-4 w-4" aria-hidden />

  return (
    <Button
      size="sm"
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
