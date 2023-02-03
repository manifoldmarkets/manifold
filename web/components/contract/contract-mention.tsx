import clsx from 'clsx'
import { Contract } from 'common/contract'
import { formatMoney } from 'common/util/format'
import Link from 'next/link'
import { contractPath, getBinaryProbPercent } from 'web/lib/firebase/contracts'
import { fromNow } from 'web/lib/util/time'
import { BinaryContractOutcomeLabel } from '../outcome-label'
import { getTextColor } from '../bet/quick-bet'
import { useIsClient } from 'web/hooks/use-is-client'

export function ContractMention(props: {
  contract: Contract
  probChange?: string
  className?: string
}) {
  const { contract, probChange, className } = props
  const { outcomeType, resolution } = contract
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
      {outcomeType === 'BINARY' && (
        <span
          className={clsx(
            probTextColor,
            'rounded-full px-2 font-semibold ring-1 ring-inset ring-indigo-100 transition-colors group-hover:ring-indigo-200'
          )}
        >
          {resolution ? (
            <BinaryContractOutcomeLabel
              contract={contract}
              resolution={resolution}
            />
          ) : (
            getBinaryProbPercent(contract)
          )}
        </span>
      )}
      {!resolution && probChange && (
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
