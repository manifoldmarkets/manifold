import { EyeOffIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { getDisplayProbability } from 'common/calculate'
import {
  clampChange,
  Contract,
  contractPath,
  dayProbChange,
} from 'common/contract'
import {
  ENV_CONFIG,
  SPICE_MARKET_TOOLTIP,
  SWEEPIES_MARKET_TOOLTIP,
} from 'common/envs/constants'
import { getFormattedMappedValue } from 'common/pseudo-numeric'
import { formatMoney, formatPercentShort } from 'common/util/format'
import Link from 'next/link'
import { useUser } from 'web/hooks/use-user'
import { getTextColor } from './text-color'
import { ContractMinibar } from '../charts/minibar'
import { Row } from '../layout/row'
import { BinaryContractOutcomeLabel } from '../outcome-label'
import { Avatar } from '../widgets/avatar'
import { useLiveContract } from 'web/hooks/use-contract'
import { Col } from '../layout/col'
import {
  actionColumn,
  probColumn,
  traderColumn,
  ColumnFormat,
  boostedColumn,
} from './contract-table-col-formats'
import { UserHovercard } from '../user/user-hovercard'
import { getFormattedNumberExpectedValue } from 'common/src/number'
import { removeEmojis } from 'common/util/string'
import { track } from 'web/lib/service/analytics'
import { Tooltip } from '../widgets/tooltip'
import { SpiceCoin } from 'web/public/custom-components/spiceCoin'
import { SweepiesCoin } from 'web/public/custom-components/sweepiesCoin'
import { getFormattedExpectedValue } from 'common/multi-numeric'
import { getFormattedExpectedDate } from 'common/multi-date'
import { Answer } from 'common/src/answer'
import { FaArrowDown, FaArrowUp } from 'react-icons/fa6'

export function ContractsTable(props: {
  contracts: Contract[]
  onContractClick?: (contract: Contract) => void
  highlightContractIds?: string[]
  columns?: ColumnFormat[]
  hideAvatar?: boolean
  contractAnswers?: { [contractId: string]: Answer[] }
}) {
  const {
    contracts,
    onContractClick,
    highlightContractIds,
    columns = [boostedColumn, traderColumn, probColumn, actionColumn],
    hideAvatar,
    contractAnswers,
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
          answers={contractAnswers?.[contract.id]}
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
  answers?: Answer[]
}) {
  const contract = useLiveContract(props.contract)

  const { columns, hideAvatar, highlighted, faded, onClick, answers } = props
  return (
    <div className="w-full">
      <Link
        href={contractPath(contract)}
        onClick={(e) => {
          if (!onClick) {
            track('click browse contract', {
              slug: contract.slug,
              contractId: contract.id,
              boosted: contract.boosted,
            })
            return
          }
          onClick()
          e.preventDefault()
        }}
        className={clsx(
          'flex w-full flex-col p-2 text-base outline-none transition-colors sm:rounded-md',
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
                className={clsx(faded && 'text-ink-500', column.width)}
              >
                {column.content({ contract })}
              </div>
            ))}
          </Row>
        </div>
        {answers && answers.length > 0 && (
          <Col className="mb-2 ml-6 mt-1 gap-1 text-sm sm:ml-8">
            {answers.map((answer) => (
              <Row key={answer.id} className="items-center px-2">
                <span className="text-ink-700 mr-1 line-clamp-1">
                  {answer.text}
                </span>
                <span className="text-sm">
                  {formatPercentShort(answer.prob)}
                </span>
                {Math.abs(clampChange(answer.prob, answer.probChanges.day)) >
                  0.02 && (
                  <Row
                    className={clsx(
                      'mx-1 inline-flex items-center rounded-full px-1 align-middle text-xs',
                      answer.probChanges.day > 0
                        ? 'bg-teal-600/10 text-teal-600'
                        : 'text-scarlet-500 bg-scarlet-500/10'
                    )}
                  >
                    {answer.probChanges.day > 0 ? (
                      <FaArrowUp className="mr-0.5 h-2.5 w-2.5" />
                    ) : (
                      <FaArrowDown className="mr-0.5 h-2.5 w-2.5" />
                    )}
                    {Math.abs(
                      Math.round(
                        clampChange(answer.prob, answer.probChanges.day) * 100
                      )
                    )}
                  </Row>
                )}
              </Row>
            ))}
          </Col>
        )}
      </Link>
    </div>
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
  showProbChange?: boolean
  chanceLabel?: boolean
  className?: string
  width?: string
}) {
  const { contract, showProbChange, chanceLabel, className, width } = props
  const probTextColor = getTextColor(contract)
  const { outcomeType } = contract

  switch (outcomeType) {
    case 'BINARY': {
      return contract.resolution ? (
        <span className={clsx(className, width)}>
          <BinaryContractOutcomeLabel
            contract={contract}
            resolution={contract.resolution}
          />
        </span>
      ) : (
        <span className={clsx(probTextColor, 'whitespace-nowrap', className)}>
          {formatPercentShort(getDisplayProbability(contract))}
          {showProbChange && !!dayProbChange(contract) && (
            <Tooltip text={`1-day probability change`}>
              <Row
                className={clsx(
                  'text-ink-700 mx-1 mb-0.5 inline-flex items-center rounded-full px-1 align-middle text-xs',
                  contract.probChanges.day > 0
                    ? 'bg-teal-600/10 text-teal-600'
                    : 'text-scarlet-500 bg-scarlet-500/10'
                )}
              >
                {contract.probChanges.day > 0 ? (
                  <FaArrowUp className="mr-0.5 h-2.5 w-2.5" />
                ) : (
                  <FaArrowDown className="mr-0.5 h-2.5 w-2.5" />
                )}
                {dayProbChange(contract)}
              </Row>
            </Tooltip>
          )}
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
      const val = getFormattedNumberExpectedValue(contract)
      return <span className={clsx(probTextColor, className)}>{val}</span>
    }
    case 'MULTI_NUMERIC': {
      const val = getFormattedExpectedValue(contract, false)
      const longVal = getFormattedExpectedValue(contract)
      return (
        <Tooltip text={longVal}>
          <span className={clsx(probTextColor, className)}>{val}</span>
        </Tooltip>
      )
    }
    case 'DATE': {
      const val = getFormattedExpectedDate(contract, false)
      const longVal = getFormattedExpectedDate(contract)
      return (
        <Tooltip text={longVal}>
          <span className={clsx(probTextColor, className)}>{val}</span>
        </Tooltip>
      )
    }
    case 'MULTIPLE_CHOICE': {
      return <ContractMinibar width={width} contract={contract} />
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

  return (
    <Row className={clsx('gap-2 sm:gap-4', className)}>
      {!hideAvatar && (
        <UserHovercard userId={contract.creatorId}>
          <Avatar
            username={contract.creatorUsername}
            avatarUrl={contract.creatorAvatarUrl}
            createdTime={contract.creatorCreatedTime}
            size="xs"
            preventDefault={true}
            className="mt-0.5"
          />
        </UserHovercard>
      )}
      <span>
        {/* <VisibilityIcon contract={contract} /> */}
        {contract.token == 'CASH' && (
          <span>
            <Tooltip
              text={SWEEPIES_MARKET_TOOLTIP}
              className=" relative mr-0.5 inline-flex h-[1em] w-[1.1em] items-baseline"
            >
              <SweepiesCoin className="absolute inset-0 top-[0.2em]" />
            </Tooltip>
          </span>
        )}
        {!!contract.isSpicePayout && (
          <span>
            <Tooltip
              text={SPICE_MARKET_TOOLTIP}
              className=" relative mr-0.5 inline-flex h-[1em] w-[1.1em] items-baseline"
            >
              <SpiceCoin className="absolute inset-0 top-[0.2em]" />
            </Tooltip>
          </span>
        )}
        {removeEmojis(contract.question)}
      </span>
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
    isLarge ? 'h-6 w-6' : 'h-4 w-4',
    'inline',
    className
  )

  if (contract.visibility === 'unlisted')
    return <EyeOffIcon className={iconClassName} />

  return <></>
}
