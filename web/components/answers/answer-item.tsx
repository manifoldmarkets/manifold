import clsx from 'clsx'
import _ from 'lodash'
import { useState } from 'react'

import { Answer } from '../../../common/answer'
import { Contract } from '../../../common/contract'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Avatar } from '../avatar'
import { SiteLink } from '../site-link'
import { DateTimeTooltip } from '../datetime-tooltip'
import dayjs from 'dayjs'
import { BuyButton } from '../yes-no-selector'
import { formatPercent } from '../../../common/util/format'
import { getOutcomeProbability } from '../../../common/calculate'
import { tradingAllowed } from '../../lib/firebase/contracts'
import { AnswerBetPanel } from './answer-bet-panel'

export function AnswerItem(props: {
  answer: Answer
  contract: Contract
  showChoice: 'radio' | 'checkbox' | undefined
  chosenProb: number | undefined
  totalChosenProb?: number
  onChoose: (answerId: string, prob: number) => void
  onDeselect: (answerId: string) => void
}) {
  const {
    answer,
    contract,
    showChoice,
    chosenProb,
    totalChosenProb,
    onChoose,
    onDeselect,
  } = props
  const { resolution, resolutions, totalShares } = contract
  const { username, avatarUrl, name, createdTime, number, text } = answer
  const isChosen = chosenProb !== undefined

  const createdDate = dayjs(createdTime).format('MMM D')
  const prob = getOutcomeProbability(totalShares, answer.id)
  const roundedProb = Math.round(prob * 100)
  const probPercent = formatPercent(prob)
  const wasResolvedTo =
    resolution === answer.id || (resolutions && resolutions[answer.id])

  const [isBetting, setIsBetting] = useState(false)

  return (
    <Col
      className={clsx(
        'p-4 sm:flex-row rounded gap-4',
        wasResolvedTo
          ? resolution === 'MKT'
            ? 'bg-blue-50 mb-2'
            : 'bg-green-50 mb-8'
          : chosenProb === undefined
          ? 'bg-gray-50'
          : showChoice === 'radio'
          ? 'bg-green-50'
          : 'bg-blue-50'
      )}
    >
      <Col className="gap-3 flex-1">
        <div className="whitespace-pre-line break-words">{text}</div>

        <Row className="text-gray-500 text-sm gap-2 items-center">
          <SiteLink className="relative" href={`/${username}`}>
            <Row className="items-center gap-2">
              <Avatar avatarUrl={avatarUrl} size={6} />
              <div className="truncate">{name}</div>
            </Row>
          </SiteLink>

          <div className="">•</div>

          <div className="whitespace-nowrap">
            <DateTimeTooltip text="" time={contract.createdTime}>
              {createdDate}
            </DateTimeTooltip>
          </div>
          <div className="">•</div>
          <div className="text-base">#{number}</div>
        </Row>
      </Col>

      {isBetting ? (
        <AnswerBetPanel
          answer={answer}
          contract={contract}
          closePanel={() => setIsBetting(false)}
        />
      ) : (
        <Row className="self-end sm:self-start items-center gap-4 justify-end">
          {!wasResolvedTo &&
            (showChoice === 'checkbox' ? (
              <input
                className="input input-bordered text-2xl justify-self-end w-24"
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
                  tradingAllowed(contract) ? 'text-green-500' : 'text-gray-500'
                )}
              >
                {probPercent}
              </div>
            ))}
          {showChoice ? (
            <div className="form-control py-1">
              <label className="cursor-pointer label gap-3">
                <span className="">Choose this answer</span>
                {showChoice === 'radio' && (
                  <input
                    className={clsx('radio', chosenProb && '!bg-green-500')}
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
              </label>
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
            <>
              {tradingAllowed(contract) && (
                <BuyButton
                  className="justify-end self-end flex-initial btn-md !px-8"
                  onClick={() => {
                    setIsBetting(true)
                  }}
                />
              )}
              {wasResolvedTo && (
                <Col className="items-end">
                  <div
                    className={clsx(
                      'text-xl',
                      resolution === 'MKT' ? 'text-blue-700' : 'text-green-700'
                    )}
                  >
                    Chosen{' '}
                    {resolutions
                      ? `${Math.round(resolutions[answer.id])}%`
                      : ''}
                  </div>
                  <div className="text-2xl text-gray-500">{probPercent}</div>
                </Col>
              )}
            </>
          )}
        </Row>
      )}
    </Col>
  )
}
