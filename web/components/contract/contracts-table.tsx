import { LockClosedIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { getDisplayProbability } from 'common/calculate'
import { Contract, contractPath } from 'common/contract'
import { ENV_CONFIG } from 'common/envs/constants'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { formatPercentShort } from 'common/util/format'
import Link from 'next/link'
import { IoUnlink } from 'react-icons/io5'
import { useUser } from 'web/hooks/use-user'
import { shortenNumber } from 'web/lib/util/shortenNumber'
import { getTextColor } from './text-color'
import { ContractMinibar } from '../charts/minibar'
import { Row } from '../layout/row'
import { BinaryContractOutcomeLabel } from '../outcome-label'
import { Avatar } from '../widgets/avatar'
import { useFirebasePublicContract } from 'web/hooks/use-contract-supabase'
import { Col } from '../layout/col'
import {
  actionColumn,
  probColumn,
  traderColumn,
  ColumnFormat,
} from './contract-table-col-formats'

export function ContractsTable(props: {
  contracts: Contract[]
  onContractClick?: (contract: Contract) => void
  highlightContractIds?: string[]
  headerClassName?: string
  hideHeader?: boolean
  columns?: ColumnFormat[]
  hideAvatar?: boolean
}) {
  const {
    contracts,
    onContractClick,
    highlightContractIds,
    headerClassName,
    hideHeader,
    columns = [traderColumn, probColumn, actionColumn],
    hideAvatar,
  } = props

  const user = useUser()

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
            {columns.map(({ header }) => (
              <div
                key={header}
                className={clsx(
                  'text-left',
                  header == 'Action' ? 'w-[3rem]' : 'w-[4rem]'
                )}
              >
                {header}
              </div>
            ))}
          </Row>
        </Row>
      )}

      {contracts.map((contract) => (
        <ContractRow
          key={contract.id}
          contract={contract}
          columns={columns}
          highlighted={highlightContractIds?.includes(contract.id)}
          hideAvatar={hideAvatar}
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
  columns: ColumnFormat[]
  highlighted?: boolean
  faded?: boolean
  onClick?: () => void
  hideAvatar?: boolean
}) {
  const contract =
    useFirebasePublicContract(props.contract.visibility, props.contract.id) ??
    props.contract
  const { columns, hideAvatar, highlighted, faded, onClick } = props
  return (
    <Link
      href={contractPath(contract)}
      onClick={(e) => {
        if (!onClick) return
        onClick()
        e.preventDefault()
      }}
      className={clsx(
        'flex w-full p-2 outline-none transition-colors sm:rounded-md',
        highlighted
          ? 'bg-primary-100'
          : 'hover:bg-primary-50 focus-visible:bg-primary-50 active:bg-primary-50',
        'border-ink-200 border-b last:border-none sm:border-none'
      )}
    >
      <div className="flex w-full flex-col justify-between gap-1 sm:flex-row sm:gap-0">
        <ContractQuestion
          contract={contract}
          className={'w-full sm:w-[calc(100%-12rem)]'}
          hideAvatar={hideAvatar}
        />
        <Row className="w-full justify-end sm:w-fit">
          {columns.map((column) => (
            <div
              key={contract.id + column.header}
              className={clsx(
                faded && 'text-ink-500',
                column.header == 'Action' ? 'w-[3rem]' : 'w-[4rem]'
              )}
            >
              {column.content(contract)}
            </div>
          ))}
        </Row>
      </div>
    </Link>
  )
}

export function isClosed(contract: Contract) {
  return (
    !!contract.closeTime &&
    contract.closeTime < Date.now() &&
    !contract.isResolved
  )
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
        <span className={className}>
          <BinaryContractOutcomeLabel
            contract={contract}
            resolution={contract.resolution}
          />
        </span>
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

function ContractQuestion(props: {
  contract: Contract
  className?: string
  hideAvatar?: boolean
}) {
  const { contract, className, hideAvatar } = props
  return (
    <Row className={clsx('gap-2 sm:gap-4', className)}>
      {!hideAvatar && (
        <Avatar
          username={contract.creatorUsername}
          avatarUrl={contract.creatorAvatarUrl}
          size="xs"
          preventDefault={true}
          className="mt-0.5"
        />
      )}
      <div>
        <VisibilityIcon contract={contract} />
        {contract.question}
      </div>
    </Row>
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
