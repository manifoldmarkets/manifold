import { ChatIcon } from '@heroicons/react/outline'
import { SparklesIcon } from '@heroicons/react/solid'
import { animated } from '@react-spring/web'
import clsx from 'clsx'
import { Answer } from 'common/answer'
import { getAnswerProbability } from 'common/calculate'
import {
  CPMMMultiContract,
  getMainBinaryMCAnswer,
  MultiContract,
  resolution,
  tradingAllowed,
} from 'common/contract'
import { TRADE_TERM } from 'common/envs/constants'
import { User } from 'common/user'
import { formatPercent } from 'common/util/format'
import { HOUR_MS } from 'common/util/time'
import { capitalize } from 'lodash'
import { ReactNode, useState } from 'react'
import { useAnimatedNumber } from 'web/hooks/use-animated-number'
import { useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { formatTimeShort } from 'client-common/lib/time'
import { MoneyDisplay } from '../bet/money-display'
import { SellSharesModal } from '../bet/sell-row'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Modal, MODAL_CLASS, SCROLLABLE_MODAL_CLASS } from '../layout/modal'
import { Row } from '../layout/row'
import {
  BinaryOutcomeLabel,
  NoLabel,
  OutcomeLabel,
  ProbPercentLabel,
  YesLabel,
} from '../outcome-label'
import { UserHovercard } from '../user/user-hovercard'
import { Avatar, EmptyAvatar } from '../widgets/avatar'
import { Linkify } from '../widgets/linkify'
import { Tooltip } from '../widgets/tooltip'
import { AnswerCpmmBetPanel } from './answer-bet-panel'
import { useSavedContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { ContractMetric } from 'common/contract-metric'
import { floatingEqual } from 'common/util/math'
import { getAnswerColor, getPseudonym } from '../charts/contract/choice'

export const AnswerBar = (props: {
  color: string // 6 digit hex
  prob: number // 0 - 1
  resolvedProb?: number // 0 - 1
  label: ReactNode
  end: ReactNode
  className?: string
  hideBar?: boolean
  renderBackgroundLayer?: React.ReactNode
  onHover?: (hovering: boolean) => void
  onClick?: () => void
  barColor?: string
}) => {
  const {
    color,
    prob,
    resolvedProb,
    label,
    end,
    className,
    hideBar,
    renderBackgroundLayer,
    onHover,
    onClick,
  } = props

  return (
    <Col
      className={clsx('relative isolate h-full w-full', className)}
      onPointerOver={onHover && (() => onHover(true))}
      onPointerLeave={onHover && (() => onHover(false))}
      onClick={onClick}
    >
      <Row className="group my-auto h-full items-center justify-between gap-x-4 px-3 py-2 leading-none">
        <div className="flex-grow">{label}</div>
        <Row className="relative  items-center justify-end gap-2">{end}</Row>
      </Row>
      <div
        className={clsx(
          'absolute bottom-0 left-0 right-0 -z-10 h-full rounded opacity-70 transition-all group-hover:opacity-100',
          hideBar ? 'bg-ink-200' : props.barColor ?? 'bg-canvas-50'
        )}
      >
        {/* bar outline if resolved */}
        {!!resolvedProb && !hideBar && (
          <div
            className={clsx(
              'absolute top-0 h-full rounded ring-1 ring-purple-500 sm:ring-2',
              resolvedProb > prob ? 'bg-purple-100 dark:bg-purple-900' : 'z-10'
            )}
            style={{
              width: `${resolvedProb * 100}%`,
            }}
          />
        )}
        {/* main bar */}
        {!hideBar && (
          <div
            className="isolate h-full rounded dark:brightness-75"
            style={{
              width: `max(8px, ${prob * 100}%)`,
              background: color,
            }}
          />
        )}
        {renderBackgroundLayer}
      </div>
    </Col>
  )
}

export const CreatorAndAnswerLabel = (props: {
  text: string
  createdTime: number
  truncate?: 'short' | 'long' | 'none' //  | medium (30)
  creator?:
    | { name: string; username: string; avatarUrl?: string; id: string }
    | false
  className?: string
}) => {
  const { text, createdTime, truncate = 'none', creator, className } = props

  const ELLIPSES_LENGTH = 3
  const maxLength = { short: 20, long: 75, none: undefined }[truncate]
  const truncated =
    maxLength && text.length > maxLength + ELLIPSES_LENGTH
      ? text.slice(0, maxLength) + '...'
      : text

  const answerTextTooltip = truncated === text ? false : text

  const dateText = `created ${formatTimeShort(createdTime)}`
  const dateTooltip = creator ? `${creator.name} ${dateText}` : dateText

  return (
    <Tooltip text={answerTextTooltip}>
      <Row className={clsx('my-1', className)}>
        <Tooltip text={dateTooltip}>
          {creator === false ? (
            <EmptyAvatar className="mr-2 inline" size={4} />
          ) : creator ? (
            <UserHovercard userId={creator.id}>
              <Avatar
                className="mr-2 inline"
                size="2xs"
                username={creator.username}
                avatarUrl={creator.avatarUrl}
              />
            </UserHovercard>
          ) : null}
        </Tooltip>
        <Linkify text={truncated} className="[&_a]:text-primary-800" />
      </Row>
    </Tooltip>
  )
}
export const AnswerLabel = (props: {
  text: string
  className?: string
  truncate?: 'short' | 'long' | 'none' //  | medium (30)
}) => {
  const { text, truncate = 'none', className } = props

  const ELLIPSES_LENGTH = 3
  const maxLength = { short: 20, long: 75, none: undefined }[truncate]
  const truncated =
    maxLength && text.length > maxLength + ELLIPSES_LENGTH
      ? text.slice(0, maxLength) + '...'
      : text

  const answerTextTooltip = truncated === text ? false : text

  return (
    <Tooltip text={answerTextTooltip}>
      <Linkify
        text={truncated}
        className={clsx('[&_a]:text-primary-800', className)}
      />
    </Tooltip>
  )
}

export const AddComment = (props: { onClick: () => void }) => {
  const { onClick } = props
  return (
    <Button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      color="gray-outline"
      size={'2xs'}
    >
      <ChatIcon className="mr-1 h-5 w-5" />
      Comment
    </Button>
  )
}

export const MultiBettor = (props: {
  answer: Answer
  contract: CPMMMultiContract
  buttonClassName?: string
}) => {
  const { answer, contract, buttonClassName } = props
  const [outcome, setOutcome] = useState<'YES' | 'NO' | undefined>(undefined)

  return (
    <>
      <Modal
        open={outcome != undefined}
        setOpen={(open) => setOutcome(open ? 'YES' : undefined)}
        className={clsx(MODAL_CLASS, SCROLLABLE_MODAL_CLASS)}
      >
        <AnswerCpmmBetPanel
          answer={answer}
          contract={contract}
          outcome={outcome}
          closePanel={() => setOutcome(undefined)}
          alwaysShowOutcomeSwitcher
        />
      </Modal>

      <Button
        size="2xs"
        color="indigo-outline"
        className={clsx('bg-primary-50', buttonClassName)}
        onClick={(e) => {
          e.stopPropagation()
          // TODO: Twomba tracking bet terminology
          track('bet intent', { location: 'answer panel' })
          setOutcome('YES')
        }}
      >
        {capitalize(TRADE_TERM)}
      </Button>
    </>
  )
}
const YesNoBetButtons = (props: {
  answer: Answer
  contract: CPMMMultiContract
  fillColor?: string
  feedReason?: string
}) => {
  const { answer, contract, feedReason, fillColor } = props
  const [outcome, setOutcome] = useState<'YES' | 'NO' | undefined>(undefined)

  return (
    <>
      <Modal
        open={outcome != undefined}
        setOpen={(open) => setOutcome(open ? 'YES' : undefined)}
      >
        <AnswerCpmmBetPanel
          answer={answer}
          feedReason={feedReason}
          contract={contract}
          outcome={outcome}
          closePanel={() => setOutcome(undefined)}
        />
      </Modal>

      <Button
        size="2xs"
        color="green-outline"
        className={clsx('!px-2.5', fillColor ?? 'bg-canvas-50')}
        onClick={(e) => {
          e.stopPropagation()
          // TODO: Twomba tracking bet terminology
          track('bet intent', { location: 'answer panel' })
          setOutcome('YES')
        }}
      >
        Yes
      </Button>
      <Button
        size="2xs"
        color="red-outline"
        className={clsx('!px-2.5', fillColor ?? 'bg-canvas-50')}
        onClick={(e) => {
          e.stopPropagation()
          // TODO: Twomba tracking bet terminology
          track('bet intent', { location: 'answer panel' })
          setOutcome('NO')
        }}
      >
        No
      </Button>
    </>
  )
}

export const MultiSeller = (props: {
  answer: Answer
  contract: MultiContract
  metric: ContractMetric
  user: User
  className?: string
}) => {
  const { answer, contract, metric, user, className } = props
  const [open, setOpen] = useState(false)
  const { totalShares, maxSharesOutcome } = metric
  const outcome = (maxSharesOutcome ?? 'YES') as 'YES' | 'NO'
  const sharesSum = totalShares[outcome] ?? 0

  return (
    <>
      {open && (
        <SellSharesModal
          contract={contract}
          user={user}
          metric={metric}
          shares={sharesSum}
          sharesOutcome={outcome}
          setOpen={setOpen}
          answerId={answer.id}
        />
      )}
      <button
        className={clsx(
          'hover:text-primary-700 text-primary-600 decoration-2 hover:underline',
          className
        )}
        onClick={() => setOpen(true)}
      >
        <span className="font-bold">Sell</span>
      </button>
    </>
  )
}

export const BinaryMultiSellRow = (props: {
  contract: CPMMMultiContract
  answer: Answer
}) => {
  const { contract, answer } = props
  const user = useUser()
  const metric = useSavedContractMetrics(contract, answer.id)
  const [open, setOpen] = useState(false)
  const otherAnswer = contract.answers.find((a) => a.id !== answer.id)!
  const { totalShares, maxSharesOutcome } = metric ?? {
    totalShares: { YES: 0, NO: 0 },
    maxSharesOutcome: 'YES',
  }
  const sharesOutcome = maxSharesOutcome as 'YES' | 'NO' | undefined
  const sharesSum = totalShares?.[sharesOutcome ?? 'YES'] ?? 0

  if (!sharesOutcome || !user || contract.isResolved) return null
  return (
    <Row className={'mt-2'}>
      {open && (
        <SellSharesModal
          contract={contract}
          user={user}
          metric={metric}
          shares={sharesSum}
          sharesOutcome={sharesOutcome}
          setOpen={setOpen}
          answerId={getMainBinaryMCAnswer(contract)?.id}
          binaryPseudonym={getPseudonym(contract)}
        />
      )}
      <Button
        className="!py-1"
        size="xs"
        color="gray-outline"
        onClick={(e) => {
          setOpen(true)
          // Necessary in the profile page to prevent the row from being toggled
          e.stopPropagation()
        }}
      >
        <Row className={'gap-1'}>
          Sell {Math.floor(sharesSum)}
          <OutcomeLabel
            outcome={sharesOutcome}
            contract={contract}
            truncate={'short'}
            pseudonym={{
              YES: {
                pseudonymName: answer.text,
                pseudonymColor: getAnswerColor(answer),
              },
              NO: {
                pseudonymName: otherAnswer.text,
                pseudonymColor: getAnswerColor(otherAnswer),
              },
            }}
          />
          shares
        </Row>
      </Button>
    </Row>
  )
}

export const OpenProb = (props: {
  contract: MultiContract
  answer: Answer
  noNewIcon?: boolean
  size?: 'sm' | 'md'
  className?: string
}) => {
  const { contract, answer, noNewIcon, size = 'md', className } = props
  const spring = useAnimatedNumber(getAnswerProbability(contract, answer.id))
  const cutoffTime = Date.now() - 6 * HOUR_MS
  const isNew =
    contract.createdTime < cutoffTime && answer.createdTime > cutoffTime
  return (
    <Row className={'items-center'}>
      <span
        className={clsx(
          'whitespace-nowrap font-bold',
          size == 'sm' ? 'min-w-[36px]' : 'min-w-[2.5rem]  text-lg ',
          className
        )}
      >
        <animated.div>{spring.to((val) => formatPercent(val))}</animated.div>
      </span>
      {isNew && !noNewIcon && (
        <Tooltip text={'Recently submitted'}>
          <SparklesIcon className="h-4 w-4 text-green-500" />
        </Tooltip>
      )}
    </Row>
  )
}
export const ClosedProb = (props: {
  prob: number
  resolvedProb?: number
  className?: string
}) => {
  const { prob, resolvedProb: resolveProb, className } = props
  return (
    <>
      {!!resolveProb && (
        <span
          className={clsx(
            'dark:text-ink-900 text-lg text-purple-500',
            className
          )}
        >
          {Math.round(resolveProb * 100)}%
        </span>
      )}
      <span
        className={clsx(
          'text-ink-500 whitespace-nowrap text-lg',
          resolveProb != undefined &&
            'inline-block min-w-[40px] text-right line-through',
          className
        )}
      >
        {formatPercent(prob)}
      </span>
    </>
  )
}

export const AnswerStatus = (props: {
  contract: MultiContract
  answer: Answer
  noNewIcon?: boolean
  className?: string
}) => {
  const { contract, answer, className } = props
  const { resolutions } = contract

  const answerResolution = answer.resolution

  const prob = getAnswerProbability(contract, answer.id)
  const resolvedProb =
    answerResolution === 'MKT'
      ? answer.resolutionProbability ?? answer.prob
      : resolutions
      ? (resolutions?.[answer.id] ?? 0) / 100
      : undefined

  const isOpen = tradingAllowed(contract, answer)

  if (answerResolution) {
    return (
      <Row className={clsx('items-center gap-1.5 font-semibold', className)}>
        <div className={'text-ink-800 text-base'}>Resolved</div>
        {answerResolution === 'MKT' && answer.resolutionProbability ? (
          <ProbPercentLabel
            prob={answer.resolutionProbability ?? answer.prob}
          />
        ) : (
          <BinaryOutcomeLabel outcome={answerResolution as resolution} />
        )}
      </Row>
    )
  }
  return isOpen ? (
    <OpenProb
      className={className}
      contract={contract}
      answer={answer}
      noNewIcon
    />
  ) : (
    <ClosedProb className={className} prob={prob} resolvedProb={resolvedProb} />
  )
}
export const BetButtons = (props: {
  contract: MultiContract
  answer: Answer
  feedReason?: string
  fillColor?: string
}) => {
  const { contract, answer, fillColor, feedReason } = props

  const isOpen = tradingAllowed(contract, answer)
  if (!isOpen) return null
  return (
    <YesNoBetButtons
      feedReason={feedReason}
      answer={answer}
      contract={contract as CPMMMultiContract}
      fillColor={fillColor}
    />
  )
}

export function AnswerPosition(props: {
  contract: MultiContract
  answer: Answer
  user: User
  myMetric: ContractMetric
  className?: string
  addDot?: boolean
}) {
  const { contract, user, answer, className, addDot, myMetric } = props

  const { invested, totalShares } = myMetric ?? {
    invested: 0,
    totalShares: { YES: 0, NO: 0 },
  }

  const yesWinnings = totalShares.YES ?? 0
  const noWinnings = totalShares.NO ?? 0
  const position = yesWinnings - noWinnings
  const isCashContract = contract.token === 'CASH'
  const canSell = tradingAllowed(contract, answer)
  const won =
    (position > 1e-7 && answer.resolution === 'YES') ||
    (position < -1e-7 && answer.resolution === 'NO')

  if (floatingEqual(yesWinnings, 0) && floatingEqual(noWinnings, 0)) return null

  return (
    <>
      <Row
        className={clsx(
          className,
          'text-ink-500 gap-1.5 whitespace-nowrap text-xs'
        )}
      >
        <Row className="gap-1">
          {canSell ? 'Payout' : won ? 'Paid out' : 'Held out for'}
          {position > 1e-7 ? (
            <>
              <span className="text-ink-700">
                <MoneyDisplay
                  amount={position}
                  isCashContract={isCashContract}
                />
              </span>{' '}
              on
              <YesLabel />
            </>
          ) : position < -1e-7 ? (
            <>
              <span className="text-ink-700">
                {' '}
                <MoneyDisplay
                  amount={-position}
                  isCashContract={isCashContract}
                />
              </span>{' '}
              on
              <NoLabel />
            </>
          ) : (
            '——'
          )}
        </Row>
        &middot;
        <Row className="gap-1">
          <div className="text-ink-500">Spent</div>
          <div className="text-ink-700">
            <MoneyDisplay amount={invested} isCashContract={isCashContract} />
          </div>
        </Row>
        {canSell && (
          <>
            &middot;
            <MultiSeller
              answer={answer}
              contract={contract}
              metric={myMetric}
              user={user}
            />
          </>
        )}
      </Row>
      {addDot && <span>&middot;</span>}
    </>
  )
}
