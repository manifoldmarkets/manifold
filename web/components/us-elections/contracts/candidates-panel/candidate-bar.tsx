import { ChatIcon } from '@heroicons/react/outline'
import {
  PresentationChartLineIcon,
  SparklesIcon,
  UserIcon,
} from '@heroicons/react/solid'
import { animated } from '@react-spring/web'
import clsx from 'clsx'
import { Answer, DpmAnswer } from 'common/answer'
import { Bet } from 'common/bet'
import { getAnswerProbability, getContractBetMetrics } from 'common/calculate'
import {
  CPMMMultiContract,
  DpmMultipleChoiceContract,
  FreeResponseContract,
  MultiContract,
  resolution,
  tradingAllowed,
} from 'common/contract'
import { User } from 'common/user'
import { formatMoney, formatPercent } from 'common/util/format'
import { HOUR_MS } from 'common/util/time'
import { sumBy } from 'lodash'
import { useState } from 'react'
import { useAnimatedNumber } from 'web/hooks/use-animated-number'
import { useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { formatTimeShort } from 'web/lib/util/time'
import { SellSharesModal } from '../../../bet/sell-row'
import { Button, IconButton } from '../../../buttons/button'
import { Col } from '../../../layout/col'
import { MODAL_CLASS, Modal } from '../../../layout/modal'
import { Row } from '../../../layout/row'
import {
  BinaryOutcomeLabel,
  NoLabel,
  ProbPercentLabel,
  YesLabel,
} from '../../../outcome-label'
import { Avatar, EmptyAvatar } from '../../../widgets/avatar'
import { Linkify } from '../../../widgets/linkify'
import { Tooltip } from '../../../widgets/tooltip'
import Image from 'next/image'
import {
  AnswerBetPanel,
  AnswerCpmmBetPanel,
} from 'web/components/answers/answer-bet-panel'
import { CANDIDATE_DATA } from '../../ candidates/candidate-data'

export const CandidateBar = (props: {
  color: string // 6 digit hex
  prob: number // 0 - 1
  resolvedProb?: number // 0 - 1
  className?: string
  hideBar?: boolean
  onHover?: (hovering: boolean) => void
  onClick?: () => void
  answer: Answer
  selected?: boolean
  contract: MultiContract
}) => {
  const {
    color,
    prob,
    resolvedProb,
    className,
    hideBar,
    onHover,
    onClick,
    answer,
    selected,
    contract,
  } = props

  const candidateImage = CANDIDATE_DATA[answer.text]?.photo
  return (
    <Col
      className={clsx('relative isolate h-full w-full', className)}
      onPointerOver={onHover && (() => onHover(true))}
      onPointerLeave={onHover && (() => onHover(false))}
      onClick={onClick}
    >
      <Row className="min-h-16 my-auto h-full items-center justify-between gap-x-4 px-4 leading-none">
        {!candidateImage ? (
          <UserIcon className="text-ink-600 h-16 w-16" />
        ) : (
          <Image
            src={candidateImage}
            alt={answer.text}
            width={64}
            height={64}
            className="object-fill"
          />
        )}
        <Col className="flex-grow">
          <OpenProb contract={contract} answer={answer} />
          <div>{answer.text}</div>
        </Col>
        <MultiBettor answer={answer} contract={contract} />
      </Row>
      <div
        className={clsx(
          'bg-canvas-0 absolute bottom-0 left-0 right-0 -z-10 h-full rounded transition-all'
        )}
      >
        {/* bar outline if resolved */}
        {!!resolvedProb && !hideBar && (
          <div
            className={clsx(
              'absolute bottom-0 w-full rounded ring-1 ring-purple-500 sm:ring-2',
              resolvedProb > prob ? 'bg-purple-100 dark:bg-purple-900' : 'z-10'
            )}
            style={{
              height: `${resolvedProb * 100}%`,
            }}
          />
        )}
        {/* main bar */}
        {!hideBar && (
          <div
            className="isolate w-full rounded dark:brightness-75"
            style={{
              height: `max(8px, ${prob * 100}%)`,
              background: color,
            }}
          />
        )}
      </div>
    </Col>
  )
}

export const MultiBettor = (props: {
  answer: Answer
  contract: MultiContract
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
        className="bg-primary-50"
        onClick={(e) => {
          e.stopPropagation()
          track('bet intent', { location: 'answer panel' })
          setOutcome('YES')
        }}
      >
        Bet
      </Button>
    </>
  )
}
export const YesNoBetButtons = (props: {
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
        color="green-outline"
        className="bg-primary-50"
        onClick={(e) => {
          e.stopPropagation()
          track('bet intent', { location: 'answer panel' })
          setOutcome('YES')
        }}
      >
        Yes
      </Button>
      <Button
        size="2xs"
        color="red-outline"
        className="bg-primary-50"
        onClick={(e) => {
          e.stopPropagation()
          track('bet intent', { location: 'answer panel' })
          setOutcome('NO')
        }}
      >
        No
      </Button>
    </>
  )
}

export const OpenProb = (props: {
  contract: MultiContract
  answer: Answer | DpmAnswer
}) => {
  const { contract, answer } = props
  const spring = useAnimatedNumber(getAnswerProbability(contract, answer.id))
  const cutoffTime = Date.now() - 6 * HOUR_MS
  const isNew =
    contract.createdTime < cutoffTime && answer.createdTime > cutoffTime
  return (
    <Row className={'items-center'}>
      <span
        className={clsx(' min-w-[2.5rem] whitespace-nowrap text-lg font-bold')}
      >
        <animated.div>{spring.to((val) => formatPercent(val))}</animated.div>
      </span>
      {isNew && (
        <Tooltip text={'Recently submitted'}>
          <SparklesIcon className="h-4 w-4 text-green-500" />
        </Tooltip>
      )}
    </Row>
  )
}
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
