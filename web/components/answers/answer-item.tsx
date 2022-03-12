import clsx from 'clsx'
import _ from 'lodash'
import { useState } from 'react'

import { Answer } from '../../../common/answer'
import { Contract } from '../../../common/contract'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Avatar } from '../avatar'
import { SiteLink } from '../site-link'
import { BuyButton } from '../yes-no-selector'
import { formatPercent } from '../../../common/util/format'
import { getOutcomeProbability } from '../../../common/calculate'
import { tradingAllowed } from '../../lib/firebase/contracts'
import { AnswerBetPanel } from './answer-bet-panel'
import { Linkify } from '../linkify'
import { User } from '../../../common/user'
import { ContractActivity } from '../feed/contract-activity'

export function AnswerItem(props: {
  answer: Answer
  contract: Contract
  user: User | null | undefined
  showChoice: 'radio' | 'checkbox' | undefined
  chosenProb: number | undefined
  totalChosenProb?: number
  onChoose: (answerId: string, prob: number) => void
  onDeselect: (answerId: string) => void
}) {
  const {
    answer,
    contract,
    user,
    showChoice,
    chosenProb,
    totalChosenProb,
    onChoose,
    onDeselect,
  } = props
  const { resolution, resolutions, totalShares } = contract
  const { username, avatarUrl, name, number, text } = answer
  const isChosen = chosenProb !== undefined

  const prob = getOutcomeProbability(totalShares, answer.id)
  const roundedProb = Math.round(prob * 100)
  const probPercent = formatPercent(prob)
  const wasResolvedTo =
    resolution === answer.id || (resolutions && resolutions[answer.id])

  const [isBetting, setIsBetting] = useState(false)

  const canBet = !isBetting && !showChoice && tradingAllowed(contract)

  return (
    <div
      className={clsx(
        'flex flex-col gap-4 rounded p-4 sm:flex-row',
        wasResolvedTo
          ? resolution === 'MKT'
            ? 'mb-2 bg-blue-50'
            : 'mb-8 bg-green-50'
          : chosenProb === undefined
          ? 'bg-gray-50'
          : showChoice === 'radio'
          ? 'bg-green-50'
          : 'bg-blue-50',
        canBet && 'cursor-pointer hover:bg-gray-100'
      )}
      onClick={() => canBet && setIsBetting(true)}
    >
      <Col className="flex-1 gap-3">
        <div className="whitespace-pre-line">
          <Linkify text={text} />
        </div>

        <Row className="items-center gap-2 text-sm text-gray-500">
          <SiteLink className="relative" href={`/${username}`}>
            <Row className="items-center gap-2">
              <Avatar avatarUrl={avatarUrl} size={6} />
              <div className="truncate">{name}</div>
            </Row>
          </SiteLink>
          {/* TODO: Show total pool? */}
          <div className="text-base">#{number}</div>
        </Row>

        {isBetting && (
          <ContractActivity
            contract={contract}
            bets={[]}
            comments={[]}
            user={user}
            filterToOutcome={answer.id}
            mode="all"
          />
        )}
      </Col>

      {isBetting ? (
        <AnswerBetPanel
          answer={answer}
          contract={contract}
          closePanel={() => setIsBetting(false)}
          className="sm:w-72"
        />
      ) : (
        <Row className="items-center justify-end gap-4 self-end sm:self-start">
          {!wasResolvedTo &&
            (showChoice === 'checkbox' ? (
              <input
                className="input input-bordered w-24 justify-self-end text-2xl"
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
              <label className="label cursor-pointer gap-3">
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
                  className="btn-md flex-initial justify-end self-end !px-8"
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
    </div>
  )
}
