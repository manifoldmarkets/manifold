import { forwardRef } from 'react'
import { Contract, contractPath } from 'common/contract'
import Link from 'next/link'
import clsx from 'clsx'
import { getDisplayProbability } from 'common/calculate'
import { getValueFromBucket } from 'common/calculate-dpm'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { BinaryContractOutcomeLabel } from '../outcome-label'
import { getTextColor } from '../bet/quick-bet'
import { Avatar } from '../widgets/avatar'
import { ContractMinibar } from '../charts/minibar'
import { useContract } from 'web/hooks/use-contracts'
import { formatPercentShort } from 'common/util/format'
import { ENV_CONFIG } from 'common/envs/constants'
import { getStonkPriceMax } from 'common/stonk'
import { Tooltip } from '../widgets/tooltip'

export function ContractStatusLabel(props: {
  contract: Contract
  chanceLabel?: boolean
}) {
  const { contract, chanceLabel } = props
  const probTextColor = getTextColor(contract)
  const { outcomeType } = contract

  switch (outcomeType) {
    case 'BINARY': {
      return contract.resolution ? (
        <BinaryContractOutcomeLabel
          contract={contract}
          resolution={contract.resolution}
        />
      ) : (
        <span className={probTextColor}>
          {formatPercentShort(getDisplayProbability(contract))}
          {chanceLabel && (
            <span className="text-ink-500 text-sm font-normal"> chance</span>
          )}
        </span>
      )
    }
    case 'STONK': {
      const val = getDisplayProbability(contract)
      return (
        <Tooltip
          text={`of ${ENV_CONFIG.moneyMoniker + getStonkPriceMax(contract)}`}
        >
          <span className={probTextColor}>
            {ENV_CONFIG.moneyMoniker + getFormattedMappedValue(contract, val)}
          </span>
        </Tooltip>
      )
    }
    case 'PSEUDO_NUMERIC': {
      const val = getDisplayProbability(contract)
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
      isClosed && !contract.isResolved ? 'text-ink-500' : 'text-ink-900'

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
          'hover:bg-primary-50 focus:bg-primary-50 group flex flex-row gap-2 whitespace-nowrap rounded-sm p-2 md:gap-4',
          className
        )}
      >
        <Avatar
          username={contract.creatorUsername}
          avatarUrl={contract.creatorAvatarUrl}
          size="xs"
        />
        {!skinny && (
          <div className="min-w-[2rem] text-right font-semibold">
            <ContractStatusLabel contract={contract} />
          </div>
        )}
        <div
          className={clsx(
            'break-anywhere whitespace-normal font-medium',
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
