import clsx from 'clsx'

import { Answer, DpmAnswer } from 'common/answer'
import { MultiContract } from 'common/contract'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Avatar, EmptyAvatar } from '../widgets/avatar'
import { SiteLink } from '../widgets/site-link'
import { formatPercent } from 'common/util/format'
import { tradingAllowed } from 'common/contract'
import { Linkify } from '../widgets/linkify'
import { Input } from '../widgets/input'
import { getAnswerProbability } from 'common/calculate'
import { useUserByIdOrAnswer } from 'web/hooks/use-user-supabase'
import { ReactNode } from 'react'
import { Tooltip } from '../widgets/tooltip'

//  TODO: make this look better
export function ResolutionAnswerItem(props: {
  answer: DpmAnswer | Answer
  contract: MultiContract
  showChoice: 'radio' | 'checkbox' | undefined
  chosenProb: number | undefined
  totalChosenProb?: number
  onChoose: (answerId: string, prob: number) => void
  onDeselect: (answerId: string) => void
  isInModal?: boolean
}) {
  const {
    answer,
    contract,
    showChoice,
    chosenProb,
    totalChosenProb,
    onChoose,
    onDeselect,
    isInModal,
  } = props
  const { resolution, resolutions, outcomeType } = contract
  const { text } = answer
  const user = useUserByIdOrAnswer(answer)
  const isChosen = chosenProb !== undefined

  const prob = getAnswerProbability(contract, answer.id)
  const roundedProb = Math.round(prob * 100)
  const probPercent = formatPercent(prob)
  const wasResolvedTo =
    resolution === answer.id || (resolutions && resolutions[answer.id])

  return (
    <div
      className={clsx(
        'flex flex-col gap-4 rounded p-4',
        isInModal ? '' : 'sm:flex-row',
        wasResolvedTo
          ? resolution === 'MKT'
            ? 'mb-2 bg-blue-500/20'
            : 'flex flex-col gap-4 rounded bg-teal-500/20 p-4'
          : chosenProb === undefined
          ? 'bg-canvas-50'
          : showChoice === 'radio'
          ? 'bg-teal-500/20'
          : 'bg-blue-500/20'
      )}
    >
      <Col className="flex-1 gap-3">
        <div className="whitespace-pre-line">
          <Linkify text={text} />
        </div>

        {outcomeType === 'FREE_RESPONSE' && (
          <Row className="text-ink-500 items-center gap-2 text-sm">
            {user ? (
              <SiteLink className="relative" href={`/${user.username}`}>
                <Row className="items-center gap-2">
                  <Avatar avatarUrl={user.avatarUrl} size="2xs" />
                  <div className="truncate">{user.name}</div>
                </Row>
              </SiteLink>
            ) : (
              <EmptyAvatar />
            )}
          </Row>
        )}
      </Col>

      <Row
        className={clsx(
          'items-center justify-end gap-4 self-end',
          isInModal ? '' : 'sm:self-start'
        )}
      >
        {!wasResolvedTo &&
          (showChoice === 'checkbox' ? (
            <Input
              className="w-24 justify-self-end !text-2xl"
              type="number"
              placeholder={`${roundedProb}`}
              maxLength={9}
              value={chosenProb ? Math.round(chosenProb) : ''}
              onChange={(e) => {
                const { value } = e.target
                const numberValue = value
                  ? parseInt(value.replace(/[^\d]/, ''))
                  : 0
                if (!isNaN(numberValue)) onChoose(answer.id, numberValue)
              }}
            />
          ) : (
            <div
              className={clsx(
                'text-2xl',
                tradingAllowed(contract) ? 'text-teal-500' : 'text-ink-500'
              )}
            >
              {probPercent}
            </div>
          ))}
        {showChoice ? (
          <div className="flex flex-col py-1">
            <Row className="cursor-pointer items-center gap-2 px-1 py-2">
              <span className="">Choose this answer</span>
              {showChoice === 'radio' && (
                <input
                  className={clsx('radio', chosenProb && '!bg-teal-500')}
                  type="radio"
                  name="opt"
                  checked={isChosen}
                  onChange={() => onChoose(answer.id, 1)}
                  value={answer.id}
                />
              )}
              {showChoice === 'checkbox' && (
                <input
                  className={clsx('checkbox', chosenProb && '!bg-blue-500')}
                  type="checkbox"
                  name="opt"
                  checked={isChosen}
                  onChange={() => {
                    if (isChosen) onDeselect(answer.id)
                    else {
                      onChoose(answer.id, 100 * prob)
                    }
                  }}
                  value={answer.id}
                />
              )}
            </Row>
            {showChoice === 'checkbox' && (
              <div className="ml-1">
                {chosenProb && totalChosenProb
                  ? Math.round((100 * chosenProb) / totalChosenProb)
                  : 0}
                % share
              </div>
            )}
          </div>
        ) : (
          wasResolvedTo && (
            <Col className="items-end">
              <div
                className={clsx(
                  'text-xl',
                  resolution === 'MKT' ? 'text-blue-700' : 'text-teal-500'
                )}
              >
                Chosen{' '}
                {resolutions ? `${Math.round(resolutions[answer.id])}%` : ''}
              </div>
            </Col>
          )
        )}
      </Row>
    </div>
  )
}

export const AnswerBar = (props: {
  color: string // 6 digit hex
  prob: number // 0 - 1
  resolvedProb?: number // 0 - 1
  label: ReactNode
  end: ReactNode
  bottom?: ReactNode
  className?: string
}) => {
  const { color, prob, resolvedProb, label, end, bottom, className } = props

  return (
    <Col>
      <div className={clsx('relative isolate w-full', className)}>
        {/* background bar */}
        <div className="bg-canvas-50 absolute left-0 right-0 bottom-0 -z-10 h-3 rounded transition-all sm:top-1/2 sm:h-full sm:-translate-y-1/2 sm:bg-inherit">
          {/* bar outline if resolved */}
          {!!resolvedProb && (
            <div
              className="absolute top-0 h-full rounded bg-purple-100 ring-1 ring-purple-500 dark:bg-purple-900 sm:ring-2"
              style={{
                width: `${resolvedProb * 100}%`,
              }}
            />
          )}
          {/* main bar */}
          <div
            className="h-full rounded opacity-70"
            style={{
              width: `max(8px, ${prob * 100}%)`,
              background: color,
            }}
          />
        </div>

        <div className="flex-wrap items-center justify-between gap-x-4 leading-none sm:flex sm:min-h-[40px] sm:flex-nowrap sm:px-3">
          {label}
          <div className="relative float-right flex grow items-center justify-end gap-2">
            {end}
          </div>
        </div>
      </div>
      {bottom && (
        <div className="mt-0.5 self-end sm:mx-3 sm:mt-0">{bottom}</div>
      )}
    </Col>
  )
}

export const AnswerLabel = (props: {
  text: string
  truncate?: 'short' | 'long' | 'none' //  | medium (30)
  creator?: { username: string; avatarUrl?: string } | false
  className?: string
}) => {
  const { text, truncate = 'none', creator, className } = props

  const ELLIPSES_LENGTH = 3
  const maxLength = { short: 20, long: 75, none: undefined }[truncate]
  const truncated =
    maxLength && text.length > maxLength + ELLIPSES_LENGTH
      ? text.slice(0, maxLength) + '...'
      : text

  return (
    <Tooltip text={truncated === text ? false : text}>
      <span className={clsx('my-1', className)}>
        {creator === false ? (
          <EmptyAvatar />
        ) : creator ? (
          <Avatar
            className="mr-2 inline"
            size="2xs"
            username={creator.username}
            avatarUrl={creator.avatarUrl}
          />
        ) : null}
        <Linkify text={truncated} />
      </span>
    </Tooltip>
  )
}
