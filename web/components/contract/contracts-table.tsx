import { ChatIcon, LockClosedIcon, UserIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { getDisplayProbability } from 'common/calculate'
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
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { Col } from '../layout/col'
import { useNumContractComments } from 'web/hooks/use-comments-supabase'
import { buildArray } from 'common/util/array'

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
      // all old numeric contracts are resolved
      const val = contract.resolutionValue ?? NaN
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
        <Col
          className={clsx(
            'whitespace-nowrap text-sm font-bold',
            contract.bountyLeft == 0 ? 'text-ink-300' : 'text-teal-600'
          )}
        >
          <span>
            {ENV_CONFIG.moneyMoniker}
            {shortenNumber(contract.bountyLeft ?? 0)}
          </span>
          <span
            className={clsx(
              'text-xs font-normal',
              contract.bountyLeft == 0 ? 'text-ink-300' : 'text-ink-600'
            )}
          >
            bounty
          </span>
        </Col>
      )
    }
    case 'POLL': {
      return <span className="text-fuchsia-500/70">POLL</span>
    }
    default:
      return <span>-</span>
  }
}

function ContractQuestion(props: { contract: Contract; className?: string }) {
  const { contract, className } = props
  return (
    <Row className={clsx('gap-2 sm:gap-4', className)}>
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
  )
}

const contractColumns = {
  traders: {
    header: 'Traders',
    content: (contract: Contract) =>
      contract.outcomeType == 'BOUNTIED_QUESTION' ? (
        <div className="h-min align-top opacity-70 sm:opacity-100">
          <BountiedContractComments contractId={contract.id} />
        </div>
      ) : (
        <div className="h-min align-top opacity-70 sm:opacity-100">
          <Row className="align-center shrink-0 items-center gap-0.5">
            <UserIcon className="h-4 w-4" />
            {shortenNumber(contract.uniqueBettorCount)}
          </Row>
        </div>
      ),
  },
  prob: {
    header: 'Stat',
    content: (contract: Contract) => (
      <div className="font-semibold ">
        <ContractStatusLabel contract={contract} />
      </div>
    ),
  },
  action: {
    header: 'Action',
    content: (contract: Contract) => <Action contract={contract} />,
  },
} as const

type ColumnKey = keyof typeof contractColumns

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

  const columns = buildArray(['traders', 'prob', !hideActions && 'action'])

  return (
    <Col className="w-full">
      {!hideHeader && (
        <Row
          className={clsx(
            'bg-canvas-50 text-ink-500 sticky top-0 z-10 w-full justify-end px-2 py-1 text-sm font-semibold sm:justify-between',
            headerClassName
          )}
        >
          <div className={' invisible w-[calc(100%-12rem)] sm:visible'}>
            Question
          </div>
          <Row>
            {columns.map((key) => (
              <div
                key={key}
                className={clsx(
                  'text-left',
                  key == 'action' ? 'w-[3rem]' : 'w-[4rem]'
                )}
              >
                {contractColumns[key].header}
              </div>
            ))}
          </Row>
        </Row>
      )}

      {contracts.map((contract, index) => (
        <ContractRow
          key={contract.id}
          isLast={index === contracts.length - 1}
          contract={contract}
          columns={columns}
          highlighted={highlightContractIds?.includes(contract.id)}
          faded={
            (isClosed(contract) && contract.creatorId !== user?.id) ||
            contract.isResolved
          }
          onClick={
            onContractClick ? () => onContractClick(contract) : undefined
          }
        />
      ))}
    </Col>
  )
}

function ContractRow(props: {
  contract: Contract
  isLast: boolean
  columns: ColumnKey[]
  highlighted?: boolean
  faded?: boolean
  onClick?: () => void
}) {
  const contract =
    useFirebasePublicContract(props.contract.visibility, props.contract.id) ??
    props.contract
  const { columns, isLast, highlighted, faded, onClick } = props

  const visibleColumns = columns.map((key) => ({
    key,
    ...contractColumns[key],
  }))

  return (
    <Link
      href={contractPath(contract)}
      onClick={(e) => {
        if (!onClick) return
        onClick()
        e.preventDefault()
      }}
      className={clsx(
        'hover:bg-primary-50 focus:bg-primary-50 flex w-full flex-row  px-2 py-2 transition-colors sm:rounded-md',
        highlighted && 'bg-primary-100',
        isLast ? '' : 'border-ink-200 border-b  sm:border-none'
      )}
    >
      <div className="flex w-full flex-col justify-between gap-1 sm:flex-row sm:gap-0">
        <ContractQuestion
          contract={contract}
          className={'w-full sm:w-[calc(100%-12rem)]'}
        />
        <Row className="w-full justify-end sm:w-fit">
          {visibleColumns.map((column) => (
            <Row
              key={contract.id}
              className={clsx(
                'group relative cursor-pointer text-left',
                faded && 'text-ink-500',
                column.key == 'action' ? 'w-[3rem]' : 'w-[4rem]'
              )}
            >
              {column.content(contract)}
            </Row>
          ))}
        </Row>
      </div>
    </Link>
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
