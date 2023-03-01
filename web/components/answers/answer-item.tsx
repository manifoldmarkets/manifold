import clsx from 'clsx'

import { Answer } from 'common/answer'
import { FreeResponseContract, MultipleChoiceContract } from 'common/contract'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Avatar } from '../widgets/avatar'
import { SiteLink } from '../widgets/site-link'
import { formatPercent } from 'common/util/format'
import { tradingAllowed } from 'web/lib/firebase/contracts'
import { Linkify } from '../widgets/linkify'
import { Input } from '../widgets/input'
import { getOutcomeProbability } from 'common/calculate'

export function AnswerItem(props: {
  answer: Answer
  contract: FreeResponseContract | MultipleChoiceContract
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
  const { resolution, resolutions } = contract
  const { username, avatarUrl, name, number, text } = answer
  const isChosen = chosenProb !== undefined

  const prob = getOutcomeProbability(contract, answer.id)
  const roundedProb = Math.round(prob * 100)
  const probPercent = formatPercent(prob)
  const wasResolvedTo =
    resolution === answer.id || (resolutions && resolutions[answer.id])

  return (
    <div
      className={clsx(
        'flex flex-col gap-4 rounded p-4 sm:flex-row',
        wasResolvedTo
          ? resolution === 'MKT'
            ? 'mb-2 bg-blue-500/30'
            : 'mb-10 bg-teal-500/30'
          : chosenProb === undefined
          ? 'bg-canvas-50'
          : showChoice === 'radio'
          ? 'bg-teal-500/30'
          : 'bg-blue-500/30'
      )}
    >
      <Col className="flex-1 gap-3">
        <div className="whitespace-pre-line">
          <Linkify text={text} />
        </div>

        <Row className="text-ink-500 items-center gap-2 text-sm">
          <SiteLink className="relative" href={`/${username}`}>
            <Row className="items-center gap-2">
              <Avatar avatarUrl={avatarUrl} size={6} />
              <div className="truncate">{name}</div>
            </Row>
          </SiteLink>
          {/* TODO: Show total pool? */}
          <div className="text-base">{showChoice && '#' + number}</div>
        </Row>
      </Col>

      <Row className="items-center justify-end gap-4 self-end sm:self-start">
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
              <div className="text-ink-500 text-2xl">{probPercent}</div>
            </Col>
          )
        )}
      </Row>
    </div>
  )
}
