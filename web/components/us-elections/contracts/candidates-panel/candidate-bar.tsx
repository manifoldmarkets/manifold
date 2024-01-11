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
import { MultiBettor, OpenProb } from 'web/components/answers/answer-components'

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
      className={clsx('relative isolate h-20 w-60 overflow-hidden', className)}
      onPointerOver={onHover && (() => onHover(true))}
      onPointerLeave={onHover && (() => onHover(false))}
      onClick={onClick}
    >
      <Row className="my-auto h-full items-center justify-between gap-x-4 pr-4 leading-none">
        {!candidateImage ? (
          <UserIcon className="text-ink-600 h-20 w-20" />
        ) : (
          <Image
            src={candidateImage}
            alt={answer.text}
            width={80}
            height={80}
            className="object-fill"
          />
        )}
        <Col className="flex-grow gap-2">
          <Row className="flex-grow justify-between">
            <OpenProb contract={contract} answer={answer} />
            <MultiBettor
              answer={answer}
              contract={contract as CPMMMultiContract}
            />
          </Row>
          <div>{answer.text}</div>
        </Col>
      </Row>
      <div
        className={clsx(
          'bg-canvas-0 absolute bottom-0 left-0 right-0 top-0 -z-10 rounded transition-all'
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
            className="isolate w-full dark:brightness-75"
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
