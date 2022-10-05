import clsx from 'clsx'
import { Contract } from 'common/contract'
import { formatMoney } from 'common/util/format'
import Link from 'next/link'
import { contractPath, getBinaryProbPercent } from 'web/lib/firebase/contracts'
import { fromNow } from 'web/lib/util/time'
import { BinaryContractOutcomeLabel } from '../outcome-label'
import { getColor } from './quick-bet'

export function ContractMention(props: { contract: Contract }) {
  const { contract } = props
  const { outcomeType, resolution } = contract
  const probTextColor = `text-${getColor(contract)}`

  return (
    <Link href={contractPath(contract)}>
      <a
        className="group inline whitespace-nowrap rounded-sm hover:bg-indigo-50 focus:bg-indigo-50"
        title={tooltipLabel(contract)}
      >
        <span className="break-anywhere mr-0.5 whitespace-normal font-normal text-indigo-700">
          {contract.question}
        </span>
        {outcomeType === 'BINARY' && (
          <span
            className={clsx(
              probTextColor,
              'rounded-full px-2 font-semibold ring-1 ring-inset ring-indigo-100 group-hover:ring-indigo-200'
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
        {/* TODO: numeric? */}
      </a>
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
