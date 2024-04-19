import { LockClosedIcon, EyeOffIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { getDisplayProbability } from 'common/calculate'
import { CPMMMultiContract, Contract, contractPath } from 'common/contract'
import { ENV_CONFIG } from 'common/envs/constants'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { formatMoney, formatPercentShort } from 'common/util/format'
import Link from 'next/link'
import { useUser } from 'web/hooks/use-user'
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
import { UserHovercard } from '../user/user-hovercard'
import { getFormattedExpectedValue } from 'common/multi-numeric'
import { useHasBetOnContract } from 'web/hooks/use-bet-on-contracts'
import { Tooltip } from '../widgets/tooltip'
import { ManaCircleIcon } from '../icons/mana-circle-icon'
import { sortAnswers } from 'common/answer'
import { useState } from 'react'
import { removeEmojis } from 'common/util/string'
import { useABTest } from 'web/hooks/use-ab-test'

export function ContractsTable(props: {
  contracts: Contract[]
  onContractClick?: (contract: Contract) => void
  highlightContractIds?: string[]
  columns?: ColumnFormat[]
  hideAvatar?: boolean
}) {
  const {
    contracts,
    onContractClick,
    highlightContractIds,
    columns = [traderColumn, probColumn, actionColumn],
    hideAvatar,
  } = props

  const user = useUser()

  return (
    <Col className="w-full">
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
  const answersABTest = useABTest('show answers in browse', ['show', 'hide'])
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
        'flex w-full flex-col p-2 outline-none transition-colors sm:rounded-md',
        highlighted
          ? 'bg-primary-100'
          : 'hover:bg-primary-100 focus-visible:bg-primary-100 active:bg-primary-100',
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
                column.header == 'Action' ? 'w-12' : 'w-16'
              )}
            >
              {column.content(contract)}
            </div>
          ))}
        </Row>
      </div>
      {answersABTest === 'show' &&
        contract.outcomeType == 'MULTIPLE_CHOICE' &&
        contract.mechanism == 'cpmm-multi-1' && (
          <ContractAnswers contract={contract} />
        )}
    </Link>
  )
}

export function LoadingContractRow() {
  return (
    <div className="border-ink-200 flex w-full animate-pulse border-b p-2 last:border-none sm:rounded-md sm:border-none">
      <div className="flex w-full flex-col justify-between gap-1 sm:flex-row sm:gap-4">
        <Row className={clsx('sm:w-[calc(100%-12rem] w-full gap-2 sm:gap-4')}>
          <div className="h-6 w-6 rounded-full bg-gray-500" />
          <div className="h-5 grow rounded-full bg-gray-500" />
        </Row>
        <div className="self-end sm:self-start">
          <div className="h-5 w-[175px] rounded-full bg-gray-500" />
        </div>
      </div>
    </div>
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
          {chanceLabel && <span className="text-sm font-normal"> chance</span>}
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
    case 'NUMBER': {
      const val = getFormattedExpectedValue(contract)
      return <span className={clsx(probTextColor, className)}>{val}</span>
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
        <span
          className={clsx(
            className,
            contract.bountyLeft == 0 ? 'text-ink-300' : 'text-teal-600'
          )}
        >
          {formatMoney(contract.bountyLeft ?? 0)}
          {chanceLabel && (
            <span
              className={clsx(
                'text-sm font-normal',
                contract.bountyLeft == 0 ? 'text-ink-300' : 'text-ink-500'
              )}
            >
              {' '}
              bounty
            </span>
          )}
        </span>
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
  const hasBetOnContract = useHasBetOnContract(contract.id)
  return (
    <Row className={clsx('gap-2 sm:gap-4', className)}>
      {!hideAvatar && (
        <UserHovercard userId={contract.creatorId}>
          <Avatar
            username={contract.creatorUsername}
            avatarUrl={contract.creatorAvatarUrl}
            size="xs"
            preventDefault={true}
            className="mt-0.5"
          />
        </UserHovercard>
      )}
      <div>
        <VisibilityIcon contract={contract} className="mr-1" />
        {hasBetOnContract && (
          <Tooltip text="You traded on this question">
            <ManaCircleIcon className="text-primary-600 mb-[2px] mr-1 inline h-4 w-4" />
          </Tooltip>
        )}
        {removeEmojis(contract.question)}
      </div>
    </Row>
  )
}

function ContractAnswers(props: { contract: CPMMMultiContract }) {
  const { contract } = props
  const [now] = useState(Date.now())
  const canAdd =
    contract.addAnswersMode === 'ANYONE' &&
    (contract.closeTime ?? Infinity) > now

  return (
    <div className="text-ink-500 my-1 grid w-full grid-cols-2 gap-x-4 pl-8 pr-4 text-sm sm:grid-cols-4 sm:pl-10 sm:pr-4">
      {sortAnswers(contract, contract.answers)
        .slice(0, canAdd ? 3 : 4)
        .map((ans) => (
          <div key={ans.id} className="flex gap-2">
            <span className="truncate">{ans.text}</span>
            <span className={'font-semibold'}>
              {formatPercentShort(ans.prob)}
            </span>
          </div>
        ))}
      {canAdd && (
        <span className="text-primary-600 truncate hover:underline">
          + Add answer
        </span>
      )}
    </div>
  )
}

export function VisibilityIcon(props: {
  contract: Contract
  isLarge?: boolean
  className?: string
}) {
  const { contract, isLarge, className } = props
  const iconClassName = clsx(
    isLarge ? 'h-6 w-6' : 'h-4 w-4',
    'inline',
    className
  )

  if (contract.visibility === 'private')
    return <LockClosedIcon className={iconClassName} />

  if (contract.visibility === 'unlisted')
    return <EyeOffIcon className={iconClassName} />

  return <></>
}
