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
import { IoUnlink } from 'react-icons/io5'
import { useContract } from 'web/hooks/use-contracts'
import { useUser } from 'web/hooks/use-user'
import { fromNow } from 'web/lib/util/time'
import { getTextColor } from '../bet/quick-bet'
import { ContractMinibar } from '../charts/minibar'
import { Row } from '../layout/row'
import { BinaryContractOutcomeLabel } from '../outcome-label'
import { Avatar } from '../widgets/avatar'
import { Tooltip } from '../widgets/tooltip'
import { filter } from '../supabase-search'

function abbreviateNumber(num: number): string {
  const MAX_VALUE = 1000000000 // 1 billion
  const MIN_VALUE = 1000 // 1 thousand
  const MAX_DECIMALS = 1
  const THOUSANDS_SUFFIXES = ['', 'k', 'M', 'B', 'T']

  // Handle negative numbers separately
  if (num < 0) {
    return '-' + abbreviateNumber(-num)
  }

  // Return the number as-is if it is out of range
  if (num >= MAX_VALUE) {
    return `${(num / MAX_VALUE).toFixed(MAX_DECIMALS)}${THOUSANDS_SUFFIXES[3]}`
  } else if (num < MIN_VALUE) {
    return Math.round(num).toString()
  }

  // Calculate the appropriate suffix and format the number
  const suffixIndex = Math.floor(Math.log10(num) / 3)
  const suffix = THOUSANDS_SUFFIXES[suffixIndex]
  const scaled = num / Math.pow(10, suffixIndex * 3)
  let formatted = scaled.toFixed(
    Math.max(MAX_DECIMALS - Math.floor(Math.log10(scaled)), 0)
  )

  // Remove trailing ".0" from the formatted string
  if (formatted.endsWith('.0')) {
    formatted = formatted.slice(0, -2)
  }

  return `${formatted}${suffix}`
}

function isClosed(contract: Contract) {
  return (
    contract.closeTime &&
    contract.closeTime < Date.now() &&
    !contract.isResolved
  )
}

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
  filter?: filter
  onContractClick?: (contract: Contract) => void
  isMobile?: boolean
  highlightContractIds?: string[]
  headerClassName?: string
}) {
  const {
    contracts,
    filter,
    onContractClick,
    isMobile,
    highlightContractIds,
    headerClassName,
  } = props
  // const contract = useContract(props.contract.id) ?? props.contract

  const contractListEntryHighlightClass =
    'bg-gradient-to-b from-primary-100 via-ink-0 to-ink-0 outline outline-2 outline-primary-400'

  const dataCellClassName = 'py-2 align-top'
  const router = useRouter()

  const lastItemClassName = 'rounded-r pr-2'
  const firstItemClassName = 'rounded-l pl-2 pr-4'
  const user = useUser()

  const contractColumns = [
    {
      name: 'market',
      header: 'Market',
      visible: true,
      content: (contract: Contract) => (
        <Row className="gap-4">
          <Avatar
            username={contract.creatorUsername}
            avatarUrl={contract.creatorAvatarUrl}
            size="xs"
          />
          <div className="">{contract.question}</div>
        </Row>
      ),
    },
    {
      name: 'prob',
      header: '%',
      visible: true,
      content: (contract: Contract) => (
        <div className="font-semibold">
          <ContractStatusLabel contract={contract} />
        </div>
      ),
    },
    {
      name: 'status',
      header: 'Status',
      visible: filter === 'all' && !isMobile,
      content: (contract: Contract) => (
        <div className="w-32">
          <Status contract={contract} user={user} />
        </div>
      ),
    },
    {
      name: 'volume',
      header: 'Volume',
      visible: !isMobile,
      content: (contract: Contract) => (
        <>
          {ENV_CONFIG.moneyMoniker}
          {abbreviateNumber(contract.volume)}
        </>
      ),
    },
    {
      name: 'visibility',
      header: '',
      visible: true,
      content: (contract: Contract) => <Visibility contract={contract} />,
    },
  ]

  return (
    <table>
      {!isMobile && (
        <thead
          className={clsx(
            'text-ink-600 sticky top-14 text-left text-sm font-semibold',
            headerClassName
          )}
        >
          <tr>
            {contractColumns.map(
              (column, index) =>
                column.visible && (
                  <th
                    className={clsx(
                      index === 0
                        ? firstItemClassName
                        : index === contractColumns.length - 1
                        ? lastItemClassName
                        : 'pr-4'
                      // column.name === 'market' ? 'w-2/3' : 'w-min'
                    )}
                  >
                    {column.header}
                  </th>
                )
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
              (isClosed(contract) && contract.creatorId !== user?.id) ||
                contract.isResolved
                ? 'opacity-60'
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
            {contractColumns.map(
              (column, index) =>
                column.visible && (
                  <td
                    className={clsx(
                      index === 0
                        ? firstItemClassName
                        : index === contractColumns.length - 1
                        ? lastItemClassName
                        : 'pr-4',
                      dataCellClassName
                      // column.name === 'market' ? 'w-2/3' : 'w-min'
                    )}
                  >
                    {column.content(contract)}
                  </td>
                )
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Visibility(props: { contract: Contract }) {
  const { contract } = props
  const iconClassName = 'h-4 w-4'
  const visibilityFields = {
    private: {
      text: 'Private',
      icon: <LockClosedIcon className={iconClassName} />,
    },
    unlisted: {
      text: 'Private',
      icon: <IoUnlink className={iconClassName} />,
    },
  }
  type VisibilityType = keyof typeof visibilityFields
  if (contract.visibility in visibilityFields) {
    const { text, icon } =
      visibilityFields[contract.visibility as VisibilityType]
    return (
      <Tooltip text={text} placement="top" className={'z-10 w-full'}>
        {icon}
      </Tooltip>
    )
  }

  return <></>
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
