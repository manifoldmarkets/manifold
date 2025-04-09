import clsx from 'clsx'
import { Contract, contractPath } from 'common/contract'
import { TRADED_TERM } from 'common/envs/constants'
import { formatWithToken } from 'common/util/format'
import Link from 'next/link'
import { useIsClient } from 'web/hooks/use-is-client'
import { fromNow } from 'client-common/lib/time'
import { ContractStatusLabel } from './contracts-table'
import { getTextColor } from './text-color'
import { track } from 'web/lib/service/analytics'

export function ContractMention(props: {
  contract: Contract
  probChange?: string
  className?: string
  trackingLocation?: string
}) {
  const { contract, probChange, className, trackingLocation } = props
  const probTextColor = getTextColor(contract)
  const isClient = useIsClient()

  return (
    <Link
      href={contractPath(contract)}
      className={clsx('group inline whitespace-nowrap rounded-sm', className)}
      title={isClient ? tooltipLabel(contract) : undefined}
      onClick={() => {
        track('contract mention click', {
          contractId: contract.id,
          trackingLocation,
        })
      }}
      // target={getIsNative() ? '_self' : '_blank'}
    >
      <span className="break-anywhere text-ink-900 group-hover:text-primary-500 group-focus:text-primary-500 mr-0.5 whitespace-normal font-medium transition-colors">
        {contract.question}
      </span>
      {contract.outcomeType === 'BINARY' && (
        <span
          className={clsx(
            probTextColor,
            'ring-primary-100 group-hover:ring-primary-200 inline-flex rounded-full px-2 align-bottom font-semibold ring-1 ring-inset transition-colors'
          )}
        >
          <ContractStatusLabel contract={contract} />
        </span>
      )}
      {!contract.resolution && probChange && (
        <span className="text-ink-500 ml-0.5 text-xs">{probChange}</span>
      )}
      &zwnj;{/* cursor positioning hack */}
    </Link>
  )
}

function tooltipLabel(contract: Contract) {
  const { resolutionTime, creatorName, volume, closeTime = 0 } = contract
  const isCashContract = contract.token === 'CASH'
  const dateFormat = resolutionTime
    ? `Resolved ${fromNow(resolutionTime)}`
    : `${closeTime < Date.now() ? 'Closed' : 'Closes'} ${fromNow(closeTime)}`

  return `By ${creatorName}. ${formatWithToken({
    amount: volume,
    token: isCashContract ? 'CASH' : 'M$',
  })} ${TRADED_TERM}. ${dateFormat}`
}
