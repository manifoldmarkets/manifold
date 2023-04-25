import { LockClosedIcon, UserIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { getDisplayProbability } from 'common/calculate'
import { getValueFromBucket } from 'common/calculate-dpm'
import { Contract, contractPath } from 'common/contract'
import { ENV_CONFIG } from 'common/envs/constants'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { getStonkPriceMax } from 'common/stonk'
import { formatPercentShort } from 'common/util/format'
import { useRouter } from 'next/router'
import { IoUnlink } from 'react-icons/io5'
import { useContract } from 'web/hooks/use-contracts'
import { useUser } from 'web/hooks/use-user'
import { getTextColor } from '../bet/quick-bet'
import { ContractMinibar } from '../charts/minibar'
import { Row } from '../layout/row'
import { BinaryContractOutcomeLabel } from '../outcome-label'
import { filter } from '../supabase-search'
import { Avatar } from '../widgets/avatar'
import { Tooltip } from '../widgets/tooltip'
import { Action } from './contract-table-action'
import Link from 'next/link'

const lastItemClassName = 'rounded-r pr-2'
const firstItemClassName = 'rounded-l pl-2 pr-4'

export function isClosed(contract: Contract) {
  return (contract.closeTime &&
    contract.closeTime < Date.now() &&
    !contract.isResolved) as boolean
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

export function ContractsTable(props: {
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

  const router = useRouter()
  const user = useUser()
  const contractColumns = [
    {
      name: 'market',
      header: 'Market',
      visible: true,
      content: (contract: Contract) => (
        <Row className="gap-2 sm:gap-4">
          <Avatar
            username={contract.creatorUsername}
            avatarUrl={contract.creatorAvatarUrl}
            size="xs"
            preventDefault={true}
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
      name: 'action',
      header: 'Action',
      visible: !isMobile,
      content: (contract: Contract) => (
        <Action contract={contract} user={user} />
      ),
    },
    {
      name: 'traders',
      header: 'Traders',
      visible: true,
      content: (contract: Contract) => (
        <Row className="align-center shrink-0 items-center gap-0.5">
          <UserIcon className="h-4 w-4" />
          {contract.uniqueBettorCount}
        </Row>
      ),
    },
    {
      name: 'visibility',
      header: '',
      visible: !isMobile,
      content: (contract: Contract) => (
        <div className="mt-1">
          <Visibility contract={contract} />
        </div>
      ),
    },
  ]

  function ContractRow(props: { contract: Contract }) {
    const contract = useContract(props.contract.id) ?? props.contract
    const contractListEntryHighlightClass =
      'bg-gradient-to-b from-primary-100 via-ink-0 to-ink-0 outline outline-2 outline-primary-400'

    const dataCellClassName = 'py-2 align-top'
    return (
      <Link
        onClick={(e) => {
          if (!onContractClick) return
          onContractClick(contract)
          e.preventDefault()
        }}
        href={contractPath(contract)}
        className="contents"
      >
        <tr
          key={contract.id}
          className={clsx(
            highlightContractIds?.includes(contract.id)
              ? contractListEntryHighlightClass
              : '',
            (isClosed(contract) && contract.creatorId !== user?.id) ||
              contract.isResolved
              ? 'text-ink-500'
              : '',
            'hover:bg-primary-50 focus:bg-primary-50 group relative cursor-pointer'
          )}
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
                      : 'pr-2 sm:pr-4',
                    dataCellClassName
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  {column.content(contract)}
                </td>
              )
          )}
        </tr>
      </Link>
    )
  }

  return (
    <table>
      {!isMobile && (
        <thead
          className={clsx(
            'text-ink-600 sticky top-14 z-20 text-left text-sm font-semibold',
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
                        : 'pr-2 sm:pr-4'
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
          <ContractRow contract={contract} />
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
      text: 'Unlisted',
      icon: <IoUnlink className={iconClassName} />,
    },
  }
  type VisibilityType = keyof typeof visibilityFields
  if (contract.visibility in visibilityFields) {
    const { text, icon } =
      visibilityFields[contract.visibility as VisibilityType]
    return (
      <Tooltip text={text} placement="top" className={'w-full'}>
        {icon}
      </Tooltip>
    )
  }

  return <></>
}
