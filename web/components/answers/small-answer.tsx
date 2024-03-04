import { ArrowRightIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import {
  OTHER_TOOLTIP_TEXT,
  sortAnswers,
  type Answer,
  type DpmAnswer,
} from 'common/answer'
import { Bet, LimitBet } from 'common/bet'
import { getAnswerProbability } from 'common/calculate'
import { CPMMMultiContract, MultiContract, contractPath } from 'common/contract'
import { User } from 'common/user'
import { floatingEqual } from 'common/util/math'
import { sumBy } from 'lodash'
import Link from 'next/link'
import { ReactNode } from 'react'
import { useUnfilledBets } from 'web/hooks/use-bets'
import { useIsAdvancedTrader } from 'web/hooks/use-is-advanced-trader'
import { useIsClient } from 'web/hooks/use-is-client'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { useUser } from 'web/hooks/use-user'
import { getAnswerColor, useChartAnswers } from '../charts/contract/choice'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { InfoTooltip } from '../widgets/info-tooltip'
import {
  AnswerPosition,
  AnswerStatus,
  CreatorAndAnswerLabel,
  MultiBettor,
} from './answer-components'
import { SHOW_LIMIT_ORDER_CHARTS_KEY } from './answers-panel'

// just the bars
export function SmallAnswerBars(props: {
  contract: MultiContract
  maxAnswers?: number
  barColor?: string
}) {
  const { contract, maxAnswers = Infinity, barColor } = props
  const { outcomeType } = contract

  const shouldAnswersSumToOne =
    'shouldAnswersSumToOne' in contract ? contract.shouldAnswersSumToOne : true
  const user = useUser()
  const answers = contract.answers
    .filter(
      (a) =>
        outcomeType === 'MULTIPLE_CHOICE' || ('number' in a && a.number !== 0)
    )
    .map((a) => ({ ...a, prob: getAnswerProbability(contract, a.id) }))

  const displayedAnswers = sortAnswers(contract, answers).slice(0, maxAnswers)

  const moreCount = answers.length - displayedAnswers.length

  const answersArray = useChartAnswers(contract).map((answer) => answer.text)

  // Note: Hide answers if there is just one "Other" answer.
  const showNoAnswers =
    answers.length === 0 || (shouldAnswersSumToOne && answers.length === 1)
  const isAdvancedTrader = useIsAdvancedTrader()
  const [shouldShowLimitOrderChart] = usePersistentLocalState<boolean>(
    true,
    SHOW_LIMIT_ORDER_CHARTS_KEY
  )
  const unfilledBets = useUnfilledBets(contract.id, {
    waitUntilAdvancedTrader: !isAdvancedTrader || !shouldShowLimitOrderChart,
  })

  return (
    <Col className="mx-[2px] gap-2">
      {showNoAnswers ? (
        <div className="text-ink-500 pb-4">No answers yet</div>
      ) : (
        <>
          {displayedAnswers.map((answer) => (
            <SmallAnswer
              user={user}
              key={answer.id}
              answer={answer}
              contract={contract}
              color={getAnswerColor(answer, answersArray)}
              barColor={barColor}
              shouldShowLimitOrderChart={
                isAdvancedTrader && shouldShowLimitOrderChart
              }
              unfilledBets={unfilledBets?.filter(
                (b) => b.answerId === answer.id
              )}
            />
          ))}
          {moreCount > 0 && (
            <Row className="w-full justify-end">
              <Link
                className="text-ink-500 hover:text-primary-500 text-sm"
                href={contractPath(contract)}
              >
                See {moreCount} more {moreCount === 1 ? 'answer' : 'answers'}{' '}
                <ArrowRightIcon className="inline h-4 w-4" />
              </Link>
            </Row>
          )}
        </>
      )}
    </Col>
  )
}

export function SmallAnswer(props: {
  contract: MultiContract
  answer: Answer | DpmAnswer
  unfilledBets?: Array<LimitBet>
  color: string
  user: User | undefined | null
  onCommentClick?: () => void
  onHover?: (hovering: boolean) => void
  userBets?: Bet[]
  barColor?: string
  shouldShowLimitOrderChart: boolean
}) {
  const {
    answer,
    contract,
    unfilledBets,
    onHover,
    color,
    userBets,
    user,
    barColor,
    shouldShowLimitOrderChart,
  } = props

  const prob = getAnswerProbability(contract, answer.id)

  const isCpmm = contract.mechanism === 'cpmm-multi-1'
  const isOther = 'isOther' in answer && answer.isOther

  const { resolution, resolutions } = contract
  const resolvedProb =
    resolution == undefined
      ? undefined
      : resolution === answer.id
      ? 1
      : (resolutions?.[answer.id] ?? 0) / 100

  const sharesSum = sumBy(userBets, (bet) =>
    bet.outcome === 'YES' ? bet.shares : -bet.shares
  )
  const hasBets = userBets && !floatingEqual(sharesSum, 0)
  const isClient = useIsClient()

  const textColorClass = resolvedProb === 0 ? 'text-ink-700' : 'text-ink-900'
  return (
    <Col className={'w-full'}>
      <SmallAnswerBar
        color={color}
        prob={prob}
        resolvedProb={resolvedProb}
        className={clsx('cursor-pointer')}
        barColor={barColor}
        label={
          <Row className={'items-center gap-1'}>
            {isOther ? (
              <span className={textColorClass}>
                Other{' '}
                <InfoTooltip
                  className="!text-ink-600 dark:!text-ink-700"
                  text={OTHER_TOOLTIP_TEXT}
                />
              </span>
            ) : (
              <CreatorAndAnswerLabel
                text={answer.text}
                createdTime={answer.createdTime}
                className={clsx(
                  'items-center text-sm !leading-none sm:text-base',
                  textColorClass
                )}
              />
            )}
          </Row>
        }
        end={
          <Row className={'items-center gap-1'}>
            <AnswerStatus contract={contract} answer={answer} noNewIcon />
            <MultiBettor
              contract={contract as CPMMMultiContract}
              answer={answer as Answer}
            />
          </Row>
        }
      />
      {!resolution && hasBets && isCpmm && user && (
        <AnswerPosition
          contract={contract}
          answer={answer as Answer}
          userBets={userBets}
          className="mt-0.5 self-end sm:mx-3 sm:mt-0"
          user={user}
        />
      )}
    </Col>
  )
}
export const SmallAnswerBar = (props: {
  color: string // 6 digit hex
  prob: number // 0 - 1
  resolvedProb?: number // 0 - 1
  label: ReactNode
  end: ReactNode
  className?: string
  hideBar?: boolean
  renderBackgroundLayer?: React.ReactNode
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
  } = props

  return (
    <Col className={clsx('relative isolate h-full w-full', className)}>
      <Row className="my-auto h-full items-center justify-between gap-2 px-3 py-2 leading-none">
        <div className="grow-x">{label}</div>
        {end}
      </Row>
      <div
        className={clsx(
          'absolute bottom-0 left-0 right-0 -z-10 h-full rounded transition-all ',
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
