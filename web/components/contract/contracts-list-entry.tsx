import { forwardRef } from 'react'
import { Contract } from 'common/contract'
import Link from 'next/link'
import clsx from 'clsx'
import { getProbability } from 'common/calculate'
import { getValueFromBucket } from 'common/calculate-dpm'
import { contractPath, getBinaryProbPercent } from 'web/lib/firebase/contracts'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { BinaryContractOutcomeLabel } from '../outcome-label'
import { getTextColor } from '../bet/quick-bet'
import { Avatar } from '../widgets/avatar'
import { ContractMinibar } from '../charts/minibar'
import { useContract } from 'web/hooks/use-contracts'

export function ContractStatusLabel(props: {
  contract: Contract
  chanceLabel?: boolean
}) {
  const { contract, chanceLabel } = props
  const probTextColor = getTextColor(contract)

  switch (contract.outcomeType) {
    case 'BINARY': {
      return contract.resolution ? (
        <BinaryContractOutcomeLabel
          contract={contract}
          resolution={contract.resolution}
        />
      ) : (
        <span className={probTextColor}>
          {getBinaryProbPercent(contract, true)}
          {chanceLabel && (
            <span className="text-sm font-normal text-gray-500"> chance</span>
          )}
        </span>
      )
    }
    case 'PSEUDO_NUMERIC': {
      const val = contract.resolutionProbability ?? getProbability(contract)
      return (
        <span className={probTextColor}>
          {getFormattedMappedValue(contract, val)}
        </span>
      )
    }
    case 'NUMERIC': {
      const val = contract.resolutionValue ?? getValueFromBucket('', contract)
      return (
        <span className={probTextColor}>
          {getFormattedMappedValue(contract, val)}
        </span>
      )
    }
    case 'FREE_RESPONSE':
    case 'MULTIPLE_CHOICE': {
      return <ContractMinibar contract={contract} />
    }
    case 'CERT': {
      return <span>CERT</span>
    }
    case 'QUADRATIC_FUNDING': {
      return <span>RAD</span>
    }
    default:
      return <span>-</span>
  }
}

// TODO: Replace with a proper table/datagrid implementation?
export const ContractsListEntry = forwardRef(
  (
    props: {
      contract: Contract
      onContractClick?: (contract: Contract) => void
      skinny?: boolean
      className?: string
    },
    ref: React.Ref<HTMLAnchorElement>
  ) => {
    const { onContractClick, skinny, className } = props
    const contract = useContract(props.contract.id) ?? props.contract

    const isClosed = contract.closeTime && contract.closeTime < Date.now()
    const textColor =
      isClosed && !contract.isResolved ? 'text-gray-500' : 'text-gray-900'

    return (
      <Link
        onClick={(e) => {
          if (!onContractClick) return
          onContractClick(contract)
          e.preventDefault()
        }}
        ref={ref}
        href={contractPath(contract)}
        className={clsx(
          'group flex flex-row gap-2 whitespace-nowrap rounded-sm p-2 hover:bg-indigo-50 focus:bg-indigo-50 md:gap-4',
          className
        )}
      >
        <Avatar
          username={contract.creatorUsername}
          avatarUrl={contract.creatorAvatarUrl}
          size="xs"
        />
        {!skinny && (
          <div className="hidden min-w-[2rem] text-right font-semibold lg:flex">
            <ContractStatusLabel contract={contract} />
          </div>
        )}
        <div
          className={clsx(
            'break-anywhere mr-0.5 whitespace-normal font-medium',
            textColor
          )}
        >
          {contract.question}
        </div>
        {skinny && (
          <div className="ml-auto min-w-[2rem] font-semibold">
            <ContractStatusLabel contract={contract} />
          </div>
        )}
      </Link>
    )
  }
)
