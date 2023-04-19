import { LockClosedIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { getDisplayProbability } from 'common/calculate'
import { getValueFromBucket } from 'common/calculate-dpm'
import { Contract, contractPath } from 'common/contract'
import { ENV_CONFIG } from 'common/envs/constants'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { getStonkPriceMax } from 'common/stonk'
import { User } from 'common/user'
import { formatPercentShort } from 'common/util/format'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { forwardRef } from 'react'
import { TbFileBroken } from 'react-icons/tb'
import { useContract } from 'web/hooks/use-contracts'
import { useUser } from 'web/hooks/use-user'
import { fromNow } from 'web/lib/util/time'
import { getTextColor } from '../bet/quick-bet'
import { ContractMinibar } from '../charts/minibar'
import { Row } from '../layout/row'
import { BinaryContractOutcomeLabel } from '../outcome-label'
import { Avatar } from '../widgets/avatar'
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
        {/* {!skinny && (
          <div className="min-w-[2rem] text-right font-semibold">
            <ContractStatusLabel contract={contract} />
          </div>
        )} */}
        <div
          className={clsx(
            'break-anywhere whitespace-normal font-medium',
            textColor
          )}
        >
          {contract.question}
        </div>
        <Row className="ml-auto gap-4">
          <div className="mr-2 min-w-[2rem] font-semibold">
            <ContractStatusLabel contract={contract} />
          </div>
        </Row>
      </Link>
    )
  }
)

export function ContractsTableEntry(props: {
  contracts: Contract[]
  onContractClick?: (contract: Contract) => void
  isMobile?: boolean
  highlightContractIds?: string[]
}) {
  const { contracts, onContractClick, isMobile, highlightContractIds } = props
  // const contract = useContract(props.contract.id) ?? props.contract

  const contractListEntryHighlightClass =
    'bg-gradient-to-b from-primary-100 via-ink-0 to-ink-0 outline outline-2 outline-primary-400'

  const dataCellClassName = 'py-2 align-top'
  const router = useRouter()

  const lastItemClassName = 'rounded-r pr-2'
  const firstItemClassName = 'rounded-l pl-2 pr-4'
  const user = useUser()

  return (
    <table>
      {!isMobile && (
        <thead className="text-ink-600 bg-canvas-50 sticky top-14 text-left text-sm font-semibold">
          <tr>
            <th className={firstItemClassName}></th>
            <th>Market</th>
            <th className={clsx(isMobile ? lastItemClassName : '')}>%</th>
            {!isMobile && (
              <>
                <th className={clsx('pl-8 pr-4')}>Status</th>
                <th className={clsx('pr-4')}>Traders</th>
                <th className={clsx(lastItemClassName)}></th>
              </>
            )}
          </tr>
        </thead>
      )}
      <tbody>
        {contracts.map((contract) => (
          <tr
            key={contract.id}
            className={clsx(
              highlightContractIds?.includes(contract.id)
                ? contractListEntryHighlightClass
                : '',
              contract.closeTime &&
                contract.closeTime < Date.now() &&
                !contract.isResolved
                ? contract.creatorId === user?.id
                  ? ''
                  : 'opacity-60'
                : '',
              'hover:bg-primary-50 focus:bg-primary-50 group cursor-pointer'
            )}
            onClick={(e) => {
              if (onContractClick) {
                onContractClick(contract)
              }
              router.push(contractPath(contract))
              e.preventDefault()
            }}
          >
            <td className={clsx(dataCellClassName, firstItemClassName)}>
              <Avatar
                username={contract.creatorUsername}
                avatarUrl={contract.creatorAvatarUrl}
                size="xs"
              />
            </td>
            <td className={clsx('pr-4', dataCellClassName)}>
              {contract.question}
            </td>
            <td
              className={clsx(
                'font-semibold',
                dataCellClassName,
                isMobile ? lastItemClassName : ''
              )}
            >
              <ContractStatusLabel contract={contract} />
            </td>
            {!isMobile && (
              <>
                <td
                  className={clsx(dataCellClassName, 'w-36 pl-8 pr-4 text-sm')}
                >
                  <Status contract={contract} user={user} />
                </td>
                <td className={clsx(dataCellClassName, 'text-sm')}>
                  {contract.uniqueBettorCount}
                </td>
                <td
                  className={clsx(
                    dataCellClassName,
                    lastItemClassName,
                    'text-sm'
                  )}
                >
                  {contract.visibility === 'private' && (
                    <Tooltip
                      text={`Private`}
                      placement="top"
                      className={'z-10 w-full'}
                    >
                      <LockClosedIcon className="h-4 w-4" />
                    </Tooltip>
                  )}
                  {contract.visibility === 'unlisted' && (
                    <Tooltip
                      text={`Unlisted`}
                      placement="top"
                      className={'z-10 w-full'}
                    >
                      <TbFileBroken className="h-4 w-4" />
                    </Tooltip>
                  )}
                </td>
              </>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Status(props: { contract: Contract; user?: User | null }) {
  const { contract, user } = props
  if (contract.resolutionTime) {
    return (
      <Tooltip
        text={`Resolved ${fromNow(contract.resolutionTime)}`}
        placement="bottom"
        className={'z-10 w-full'}
      >
        <span>Resolved</span>
      </Tooltip>
    )
  }
  if (contract.closeTime) {
    if (contract.closeTime < Date.now()) {
      return (
        <Tooltip
          text={`Closed ${fromNow(contract.closeTime)}`}
          placement="top"
          className={'z-10 w-full'}
        >
          {contract.creatorId === user?.id && (
            <span className="dark:text-scarlet-300 text-scarlet-600">
              Please resolve
            </span>
          )}
          {contract.creatorId !== user?.id && <span>Closed</span>}
        </Tooltip>
      )
    } else {
      return (
        <Tooltip
          text={`Closes ${fromNow(contract.closeTime)}`}
          placement="top"
          className={'z-10 w-full'}
        >
          <span className="text-teal-500">Open</span>
        </Tooltip>
      )
    }
  }
  return <></>
}
