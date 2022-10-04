import clsx from 'clsx'
import { Contract } from 'common/contract'
import Link from 'next/link'
import { contractPath, getBinaryProbPercent } from 'web/lib/firebase/contracts'
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
        title={outcomeType}
      >
        <span className="break-anywhere mr-0.5 whitespace-normal font-normal text-indigo-700">
          {contract.question}
        </span>
        {outcomeType === 'BINARY' && (
          <span
            className={clsx(
              probTextColor,
              'rounded-full  px-1 font-semibold ring-1 ring-inset ring-indigo-100 group-hover:ring-0'
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
