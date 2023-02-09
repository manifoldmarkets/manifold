import clsx from 'clsx'
import { Contract } from 'common/contract'
import { formatMoney } from 'common/util/format'
import Link from 'next/link'
import { contractPath } from 'web/lib/firebase/contracts'
import { fromNow } from 'web/lib/util/time'
import { getTextColor } from '../bet/quick-bet'
import { useIsClient } from 'web/hooks/use-is-client'
import { ContractStatusLabel } from './contracts-list-entry'

export function ContractMention(props: {
  contract: Contract
  probChange?: string
  className?: string
}) {
  const { contract, probChange, className } = props
  const probTextColor = getTextColor(contract)
  const isClient = useIsClient()

  return (
    <Link
      href={contractPath(contract)}
      className={clsx('group inline whitespace-nowrap rounded-sm', className)}
      title={isClient ? tooltipLabel(contract) : undefined}
    >
      <span className="break-anywhere mr-0.5 whitespace-normal font-medium text-gray-900 transition-colors group-hover:text-indigo-500 group-focus:text-indigo-500">
        {contract.question}
      </span>
      <span
        className={clsx(
          probTextColor,
          'inline-flex rounded-full px-2 align-bottom font-semibold ring-1 ring-inset ring-indigo-100 transition-colors group-hover:ring-indigo-200'
        )}
      >
        <ContractStatusLabel contract={contract} />
      </span>
      {!contract.resolution && probChange && (
        <span className="ml-0.5 text-xs text-gray-500">{probChange}</span>
      )}
      &zwnj;{/* cursor positioning hack */}
    </Link>
  )
}

function tooltipLabel(contract: Contract) {
  const { resolutionTime, creatorName, volume, closeTime = 0 } = contract
  const dateFormat = resolutionTime
    ? `Resolved ${fromNow(resolutionTime)}`
    : `${closeTime < Date.now() ? 'Closed' : 'Closes'} ${fromNow(closeTime)}`

  return `By ${creatorName}. ${formatMoney(volume)} bet. ${dateFormat}`
}
