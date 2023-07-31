import { ChatIcon, LockClosedIcon, UserIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { getDisplayProbability } from 'common/calculate'
import { getValueFromBucket } from 'common/calculate-dpm'
import { Contract, contractPath } from 'common/contract'
import { ENV_CONFIG } from 'common/envs/constants'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { formatMoney, formatPercentShort } from 'common/util/format'
import Link from 'next/link'
import { IoUnlink } from 'react-icons/io5'
import { useUser } from 'web/hooks/use-user'
import { shortenNumber } from 'web/lib/util/shortenNumber'
import { getTextColor } from '../bet/quick-bet'
import { ContractMinibar } from '../charts/minibar'
import { Row } from '../layout/row'
import { BinaryContractOutcomeLabel } from '../outcome-label'
import { Avatar } from '../widgets/avatar'
import { Action } from './contract-table-action'
import { useFirebasePublicAndRealtimePrivateContract } from 'web/hooks/use-contract-supabase'
import { Col } from '../layout/col'
import { useNumContractComments } from 'web/hooks/use-comments-supabase'

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
  className?: string
}) {
  const { contract, chanceLabel, className } = props
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
        <span className={clsx(probTextColor, className)}>
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
        <span className={clsx(probTextColor, className)}>
          {ENV_CONFIG.moneyMoniker + getFormattedMappedValue(contract, val)}
        </span>
      )
    }
    case 'PSEUDO_NUMERIC': {
      const val = getDisplayProbability(contract)
      return (
        <span className={clsx(probTextColor, className)}>
          {getFormattedMappedValue(contract, val)}
        </span>
      )
    }
    case 'NUMERIC': {
      const val = contract.resolutionValue ?? getValueFromBucket('', contract)
      return (
        <span className={clsx(probTextColor, className)}>
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
    case 'BOUNTIED_QUESTION': {
      return (
        <Col className="whitespace-nowrap text-sm font-bold text-teal-600">
          {formatMoney(contract.bountyLeft)}{' '}
          <span className="text-ink-600 -mt-1 text-xs font-normal">bounty</span>
        </Col>
      )
    }
    case 'POLL': {
      return (
        <div className="gap-0.5 rounded-full bg-indigo-500/20 px-2 py-0.5 text-sm text-indigo-500">
          Poll
        </div>
      )
    }
    default:
      return <span>-</span>
  }
}

export function ContractsTable(props: {
  contracts: Contract[]
  onContractClick?: (contract: Contract) => void
  isMobile?: boolean
  highlightContractIds?: string[]
  headerClassName?: string
  hideHeader?: boolean
  hideActions?: boolean
}) {
  const {
    contracts,
    onContractClick,
    isMobile,
    highlightContractIds,
    headerClassName,
    hideHeader,
    hideActions,
  } = props

  const user = useUser()
  const contractColumns = [
    {
      name: 'question',
      header: 'Question',
      visible: true,
      content: (contract: Contract) => (
        <Row className="gap-2 sm:gap-4">
          <Avatar
            username={contract.creatorUsername}
            avatarUrl={contract.creatorAvatarUrl}
            size="xs"
            preventDefault={true}
          />
          <div className="">
            <VisibilityIcon contract={contract} /> {contract.question}
          </div>
        </Row>
      ),
    },
    {
      name: 'prob',
      header: 'Prob',
      visible: true,
      content: (contract: Contract) => (
        <div className="font-semibold">
          <ContractStatusLabel contract={contract} />
        </div>
      ),
    },

    {
      name: 'traders',
      header: 'Traders',
      visible: true,
      content: (contract: Contract) =>
        contract.outcomeType == 'BOUNTIED_QUESTION' ? (
          <BountiedContractComments contractId={contract.id} />
        ) : (
          <Row className="align-center shrink-0 items-center gap-0.5">
            <UserIcon className="h-4 w-4" />
            {shortenNumber(contract.uniqueBettorCount)}
          </Row>
        ),
    },
    // {
    //   name: 'visibility',
    //   header: '',
    //   visible: !isMobile,
    //   content: (contract: Contract) => (
    //     <div className="mt-1">
    //       <Visibility contract={contract} />
    //     </div>
    //   ),
    // },
    ...(hideActions
      ? []
      : [
          {
            name: 'action',
            header: '',
            visible: !isMobile,
            content: (contract: Contract) => (
              <Action contract={contract} user={user} />
            ),
          },
        ]),
  ]

  function ContractRow(props: { contract: Contract }) {
    const contract =
      useFirebasePublicAndRealtimePrivateContract(
        props.contract.visibility,
        props.contract.id
      ) ?? props.contract
    const contractListEntryHighlightClass = 'bg-primary-100'

    const dataCellClassName = 'py-2 align-top'
    return (
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
                key={column.name}
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
                <Link
                  onClick={(e) => {
                    if (!onContractClick) return
                    onContractClick(contract)
                    e.preventDefault()
                  }}
                  href={contractPath(contract)}
                  className="contents"
                >
                  {column.content(contract)}
                </Link>
              </td>
            )
        )}
      </tr>
    )
  }

  return (
    <table>
      {!isMobile && !hideHeader && (
        <thead
          className={clsx(
            'text-ink-600 bg-canvas-50 text-left text-sm font-semibold',
            headerClassName
          )}
        >
          <tr>
            {contractColumns.map(
              (column, index) =>
                column.visible && (
                  <th
                    key={column.name}
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
          <ContractRow key={contract.id} contract={contract} />
        ))}
      </tbody>
    </table>
  )
}

export function VisibilityIcon(props: {
  contract: Contract
  isLarge?: boolean
  className?: string
}) {
  const { contract, isLarge, className } = props
  const iconClassName = clsx(
    isLarge ? 'h-6 w-w' : 'h-4 w-4',
    'inline',
    className
  )

  if (contract.visibility === 'private')
    return <LockClosedIcon className={iconClassName} />

  if (contract.visibility === 'unlisted') <IoUnlink className={iconClassName} />

  return <></>
}

export function BountiedContractComments(props: { contractId: string }) {
  const { contractId } = props
  const numComments = useNumContractComments(contractId)
  return (
    <Row className="align-center shrink-0 items-center gap-0.5">
      <ChatIcon className="h-4 w-4" />
      {numComments}
    </Row>
  )
}
