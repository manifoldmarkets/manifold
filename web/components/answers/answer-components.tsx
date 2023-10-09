import { ChatIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { Answer, DpmAnswer } from 'common/answer'
import {
  CPMMMultiContract,
  DpmMultipleChoiceContract,
  FreeResponseContract,
  MultiContract,
  resolution,
  tradingAllowed,
} from 'common/contract'
import { formatPercent } from 'common/util/format'
import { ReactNode, useState } from 'react'
import { IconButton, Button } from '../buttons/button'
import { Modal, MODAL_CLASS } from '../layout/modal'
import { AnswerBetPanel, AnswerCpmmBetPanel } from './answer-bet-panel'
import { useUser } from 'web/hooks/use-user'
import { Bet } from 'common/bet'
import { sumBy } from 'lodash'
import { User } from 'common/user'
import { SellSharesModal } from '../bet/sell-row'
import { BinaryOutcomeLabel, ProbPercentLabel } from '../outcome-label'
import { getAnswerProbability } from 'common/calculate'
import { floatingEqual } from 'common/util/math'
import { formatTimeShort } from 'web/lib/util/time'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { EmptyAvatar, Avatar } from '../widgets/avatar'
import { Linkify } from '../widgets/linkify'
import { Tooltip } from '../widgets/tooltip'

export const AnswerBar = (props: {
  color: string // 6 digit hex
  prob: number // 0 - 1
  resolvedProb?: number // 0 - 1
  label: ReactNode
  end: ReactNode
  bottom?: ReactNode
  className?: string
  hideBar?: boolean
}) => {
  const { color, prob, resolvedProb, label, end, bottom, className, hideBar } =
    props

  return (
    <Col>
      <Col className={clsx('relative isolate h-full w-full', className)}>
        <Row className="my-auto h-full items-center justify-between gap-x-4 px-3 py-2 leading-none">
          <div className="flex-grow">{label}</div>
          <Row className="relative items-center justify-end gap-2">{end}</Row>
        </Row>
        <div
          className={clsx(
            'absolute left-0 right-0 bottom-0 -z-10 h-full rounded transition-all ',
            hideBar ? 'bg-ink-200' : 'bg-canvas-50'
          )}
        >
          {/* bar outline if resolved */}
          {!!resolvedProb && !hideBar && (
            <div
              className="absolute top-0 h-full rounded bg-purple-100 ring-1 ring-purple-500 dark:bg-purple-900 sm:ring-2"
              style={{
                width: `${resolvedProb * 100}%`,
              }}
            />
          )}
          {/* main bar */}
          {!hideBar && (
            <div
              className="h-full rounded opacity-70 dark:opacity-40"
              style={{
                width: `max(8px, ${prob * 100}%)`,
                background: color,
              }}
            />
          )}
        </div>
      </Col>
      {bottom && (
        <div className="mt-0.5 self-end sm:mx-3 sm:mt-0">{bottom}</div>
      )}
    </Col>
  )
}

export const AnswerLabel = (props: {
  text: string
  index: number | undefined
  createdTime: number
  truncate?: 'short' | 'long' | 'none' //  | medium (30)
  creator?: { username: string; avatarUrl?: string } | false
  className?: string
}) => {
  const {
    text,
    index,
    createdTime,
    truncate = 'none',
    creator,
    className,
  } = props

  const ELLIPSES_LENGTH = 3
  const maxLength = { short: 20, long: 75, none: undefined }[truncate]
  const truncated =
    maxLength && text.length > maxLength + ELLIPSES_LENGTH
      ? text.slice(0, maxLength) + '...'
      : text

  const answerTextTooltip = truncated === text ? false : text

  const indexText = index !== undefined ? `#${index + 1}: ` : ''
  const dateText = `created ${formatTimeShort(createdTime)}`
  const dateTooltip = `${indexText}${dateText}`

  return (
    <Tooltip text={answerTextTooltip}>
      <span className={clsx('my-1', className)}>
        <Tooltip text={dateTooltip}>
          {creator === false ? (
            <EmptyAvatar className="mr-2 inline" size={4} />
          ) : creator ? (
            <Avatar
              className="mr-2 inline"
              size="2xs"
              username={creator.username}
              avatarUrl={creator.avatarUrl}
            />
          ) : null}
        </Tooltip>
        <Linkify text={truncated} className="[&_a]:text-primary-800" />
      </span>
    </Tooltip>
  )
}

export const AddComment = (props: { onClick: () => void }) => {
  return (
    <IconButton onClick={props.onClick} className="!p-1">
      <ChatIcon className="h-5 w-5" />
    </IconButton>
  )
}

export const DPMMultiBettor = (props: {
  answer: DpmAnswer
  contract: DpmMultipleChoiceContract | FreeResponseContract
}) => {
  const { answer, contract } = props
  const [open, setOpen] = useState(false)

  return (
    <>
      <Modal open={open} setOpen={setOpen} className={MODAL_CLASS}>
        <AnswerBetPanel
          answer={answer}
          contract={contract}
          closePanel={() => setOpen(false)}
        />
      </Modal>

      <Button
        size="2xs"
        onClick={(e) => {
          e.preventDefault()
          setOpen(true)
        }}
      >
        Bet
      </Button>
    </>
  )
}

export const MultiBettor = (props: {
  answer: Answer
  contract: CPMMMultiContract
}) => {
  const { answer, contract } = props
  const [outcome, setOutcome] = useState<'YES' | 'NO' | 'LIMIT' | undefined>(
    undefined
  )

  const user = useUser()

  return (
    <>
      <Modal
        open={outcome != undefined}
        setOpen={(open) => setOutcome(open ? 'YES' : undefined)}
        className={MODAL_CLASS}
      >
        <AnswerCpmmBetPanel
          answer={answer}
          contract={contract}
          outcome={outcome}
          closePanel={() => setOutcome(undefined)}
          me={user}
        />
      </Modal>

      <Button
        size="2xs"
        color="indigo-outline"
        className="whitespace-nowrap"
        onClick={() => setOutcome('YES')}
      >
        Bet
      </Button>
    </>
  )
}

export const MultiSeller = (props: {
  answer: Answer
  contract: CPMMMultiContract
  userBets: Bet[]
  user: User
}) => {
  const { answer, contract, userBets, user } = props
  const [open, setOpen] = useState(false)
  const sharesSum = sumBy(userBets, (bet) =>
    bet.outcome === 'YES' ? bet.shares : -bet.shares
  )

  return (
    <>
      {open && (
        <SellSharesModal
          contract={contract}
          user={user}
          userBets={userBets}
          shares={Math.abs(sharesSum)}
          sharesOutcome={sharesSum > 0 ? 'YES' : 'NO'}
          setOpen={setOpen}
          answerId={answer.id}
        />
      )}
      <Button
        size="2xs"
        color="indigo-outline"
        className="whitespace-nowrap"
        onClick={() => setOpen(true)}
      >
        Sell
      </Button>
    </>
  )
}

export const OpenProb = (props: { prob: number }) => (
  <span className="whitespace-nowrap text-lg font-bold">
    {formatPercent(props.prob)}
  </span>
)

export const ClosedProb = (props: { prob: number; resolvedProb?: number }) => {
  const { prob, resolvedProb: resolveProb } = props
  return (
    <>
      {!!resolveProb && (
        <span className="dark:text-ink-900 text-lg text-purple-500">
          {Math.round(resolveProb * 100)}%
        </span>
      )}
      <span
        className={clsx(
          'text-ink-500 whitespace-nowrap text-lg',
          resolveProb != undefined &&
            'inline-block min-w-[40px] text-right line-through'
        )}
      >
        {formatPercent(prob)}
      </span>
    </>
  )
}

export const AnswerStatusAndBetButtons = (props: {
  contract: MultiContract
  answer: Answer | DpmAnswer
  userBets: Bet[]
  noBetButtons?: boolean
}) => {
  const { contract, answer, userBets, noBetButtons } = props
  const { resolutions } = contract

  const user = useUser()

  const isDpm = contract.mechanism === 'dpm-2'
  const answerResolution =
    'resolution' in answer ? answer.resolution : undefined

  const prob = getAnswerProbability(contract, answer.id)
  const resolvedProb =
    answerResolution == undefined
      ? undefined
      : answerResolution === answer.id
      ? 1
      : (resolutions?.[answer.id] ?? 0) / 100

  const sharesSum = sumBy(userBets, (bet) =>
    bet.outcome === 'YES' ? bet.shares : -bet.shares
  )
  const hasBets = userBets && !floatingEqual(sharesSum, 0)
  const isOpen = tradingAllowed(
    contract,
    'resolution' in answer ? answer : undefined
  )

  if (answerResolution || contract.resolution) {
    return (
      <Row className="items-center gap-1.5 font-semibold">
        <div className={'text-ink-800 text-base'}>
          Resolved
        </div>
        {answerResolution === 'MKT' && 'resolutionProbability' in answer ? (
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
    <>
      <OpenProb prob={prob} />
      {noBetButtons ? null : isDpm ? (
        <DPMMultiBettor answer={answer as any} contract={contract} />
      ) : (
        <>
          <MultiBettor answer={answer as any} contract={contract as any} />
          {user && hasBets && (
            <MultiSeller
              answer={answer as any}
              contract={contract as any}
              userBets={userBets}
              user={user}
            />
          )}
        </>
      )}
    </>
  ) : (
    <ClosedProb prob={prob} resolvedProb={resolvedProb} />
  )
}
