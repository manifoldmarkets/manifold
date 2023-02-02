import clsx from 'clsx'
import { Contract } from 'common/contract'
import Link from 'next/link'
import { contractPath, getBinaryProbPercent } from 'web/lib/firebase/contracts'
import { BinaryContractOutcomeLabel } from '../outcome-label'
import { getTextColor } from '../bet/quick-bet'
import { Avatar } from '../widgets/avatar'

// TODO: Replace with a proper table/datagrid implementation?
export function ContractsListEntry(props: {
  contract: Contract
  probChange?: string
  className?: string
}) {
  const { contract, probChange, className } = props
  const { outcomeType, resolution } = contract
  const probTextColor = getTextColor(contract)

  return (
    <Link
      href={contractPath(contract)}
      className={clsx(
        'group flex flex-row gap-2 whitespace-nowrap rounded-sm hover:bg-indigo-50 focus:bg-indigo-50',
        className
      )}
    >
      <Avatar
        className="mt-0.5"
        username={contract.creatorName}
        avatarUrl={contract.creatorAvatarUrl}
        size="xs"
      />
      <div className="min-w-[34px]">
        {outcomeType === 'BINARY' && (
          <span
            className={clsx(
              probTextColor,
              'rounded-full font-semibold ring-inset ring-indigo-100 group-hover:ring-indigo-200'
            )}
          >
            {resolution ? (
              <BinaryContractOutcomeLabel
                contract={contract}
                resolution={resolution}
              />
            ) : (
              getBinaryProbPercent(contract, true)
            )}
          </span>
        )}
        {!resolution && probChange && (
          <span className="ml-0.5 text-xs text-gray-500">{probChange}</span>
        )}
      </div>
      <div className="break-anywhere mr-0.5 whitespace-normal font-medium text-gray-900">
        {contract.question}
      </div>
    </Link>
  )
}
