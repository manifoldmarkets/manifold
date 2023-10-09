import { sortBy, sum } from 'lodash'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'

import {
  CPMMMultiContract,
  MultiContract,
  tradingAllowed,
} from 'common/contract'
import { Col } from '../layout/col'
import { APIError, resolveMarket } from 'web/lib/firebase/api'
import { Row } from '../layout/row'
import { ChooseCancelSelector } from '../bet/yes-no-selector'
import { ResolveConfirmationButton } from '../buttons/confirmation-button'
import { removeUndefinedProps } from 'common/util/object'
import { BETTORS } from 'common/user'
import { Button } from '../buttons/button'
import { useAdmin } from 'web/hooks/use-admin'
import { useUser } from 'web/hooks/use-user'
import { getAnswerColor } from './answers-panel'
import { DpmAnswer, Answer } from 'common/answer'
import { getAnswerProbability } from 'common/calculate'
import { formatPercent } from 'common/util/format'
import { useUserByIdOrAnswer } from 'web/hooks/use-user-supabase'
import { MiniResolutionPanel } from '../resolution-panel'
import { Avatar, EmptyAvatar } from '../widgets/avatar'
import { InfoTooltip } from '../widgets/info-tooltip'
import { Input } from '../widgets/input'
import { Linkify } from '../widgets/linkify'
import {
  AnswerBar,
  AnswerLabel,
  AnswerStatusAndBetButtons,
} from './answer-components'

function getAnswerResolveButtonColor(
  resolveOption: string | undefined,
  answers: string[],
  chosenAnswers: { [answerId: string]: number }
) {
  return resolveOption === 'CANCEL'
    ? 'yellow'
    : resolveOption === 'CHOOSE_ONE' && answers.length
    ? 'green'
    : resolveOption === 'CHOOSE_MULTIPLE' &&
      answers.length > 1 &&
      answers.every((answer) => chosenAnswers[answer] > 0)
    ? 'blue'
    : 'indigo'
}

function getAnswerResolveButtonDisabled(
  resolveOption: string | undefined,
  answers: string[],
  chosenAnswers: { [answerId: string]: number }
) {
  return (
    (resolveOption === 'CHOOSE_ONE' && !answers.length) ||
    (resolveOption === 'CHOOSE_MULTIPLE' &&
      (!(answers.length > 1) ||
        !answers.every((answer) => chosenAnswers[answer] > 0)))
  )
}

function getAnswerResolveButtonLabel(
  resolveOption: string | undefined,
  chosenText: string,
  answers: string[]
) {
  return resolveOption === 'CANCEL'
    ? 'N/A'
    : resolveOption === 'CHOOSE_ONE'
    ? chosenText
    : `${answers.length} answers`
}

function AnswersResolveOptions(props: {
  isAdmin: boolean
  isCreator: boolean
  contract: MultiContract
  resolveOption: 'CHOOSE_ONE' | 'CHOOSE_MULTIPLE' | 'CANCEL' | undefined
  setResolveOption: (
    option: 'CHOOSE_ONE' | 'CHOOSE_MULTIPLE' | 'CANCEL' | undefined
  ) => void
  chosenAnswers: { [answerId: string]: number }
  isInModal?: boolean
}) {
  const {
    contract,
    resolveOption,
    setResolveOption,
    chosenAnswers,
    isAdmin,
    isCreator,
    isInModal,
  } = props
  const isCpmm = contract.mechanism === 'cpmm-multi-1'
  const answerIds = Object.keys(chosenAnswers)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [warning, setWarning] = useState<string | undefined>(undefined)

  const answer = isCpmm
    ? contract.answers.find((a) => a.id === answerIds[0])
    : contract.answers[
        (contract.outcomeType === 'FREE_RESPONSE' ? -1 : 0) +
          parseInt(answerIds[0])
      ]
  const chosenText = answer?.text ?? 'an answer'

  useEffect(() => {
    if (resolveOption === 'CANCEL') {
      setWarning(`Cancel all trades and return money back to ${BETTORS}.`)
    } else {
      setWarning(undefined)
    }
  }, [resolveOption])

  const onResolve = async () => {
    if (resolveOption === 'CHOOSE_ONE' && answerIds.length !== 1) return
    if (resolveOption === 'CHOOSE_MULTIPLE' && answerIds.length < 2) return

    setIsSubmitting(true)

    const totalProb = sum(Object.values(chosenAnswers))
    const resolutions = isCpmm
      ? Object.entries(chosenAnswers).map(([answerId, p]) => {
          return { answerId, pct: (100 * p) / totalProb }
        })
      : Object.entries(chosenAnswers).map(([i, p]) => {
          return { answer: parseInt(i), pct: (100 * p) / totalProb }
        })

    const resolutionProps = isCpmm
      ? removeUndefinedProps({
          contractId: contract.id,
          outcome: resolveOption,
          resolutions:
            resolveOption === 'CHOOSE_MULTIPLE' ? resolutions : undefined,
          answerId: resolveOption === 'CHOOSE_ONE' ? answerIds[0] : undefined,
        })
      : removeUndefinedProps({
          contractId: contract.id,
          outcome:
            resolveOption === 'CHOOSE_ONE'
              ? parseInt(answerIds[0])
              : resolveOption === 'CHOOSE_MULTIPLE'
              ? 'MKT'
              : 'CANCEL',
          resolutions:
            resolveOption === 'CHOOSE_MULTIPLE' ? resolutions : undefined,
        })

    try {
      const result = await resolveMarket(resolutionProps)
      console.log('resolved', resolutionProps, 'result:', result)
    } catch (e) {
      if (e instanceof APIError) {
        setError(e.toString())
      } else {
        console.error(e)
        setError('Error resolving question')
      }
    }

    setResolveOption(undefined)
    setIsSubmitting(false)
  }

  return (
    <Col className="gap-4 rounded">
      <Row className="justify-between">
        {!isInModal && <div>Resolve your question</div>}
        {isInModal && <div>Resolve "{contract.question}"</div>}
        {isAdmin && !isCreator && (
          <span className="bg-scarlet-500/20 text-scarlet-500 rounded p-1 text-xs">
            ADMIN
          </span>
        )}
      </Row>
      <div className="flex flex-col items-stretch justify-center gap-4 sm:flex-row sm:flex-wrap md:justify-between">
        <ChooseCancelSelector
          selected={resolveOption}
          onSelect={setResolveOption}
        />

        <Row className="justify-end gap-1">
          {resolveOption && (
            <Button
              color="gray-white"
              size="xl"
              className="font-medium"
              onClick={() => {
                setResolveOption(undefined)
              }}
            >
              Clear
            </Button>
          )}

          {!isInModal && (
            <ResolveConfirmationButton
              color={getAnswerResolveButtonColor(
                resolveOption,
                answerIds,
                chosenAnswers
              )}
              label={getAnswerResolveButtonLabel(
                resolveOption,
                chosenText,
                answerIds
              )}
              marketTitle={contract.question}
              disabled={getAnswerResolveButtonDisabled(
                resolveOption,
                answerIds,
                chosenAnswers
              )}
              onResolve={onResolve}
              isSubmitting={isSubmitting}
            />
          )}
          {isInModal && (
            <Button
              color={getAnswerResolveButtonColor(
                resolveOption,
                answerIds,
                chosenAnswers
              )}
              disabled={
                isSubmitting ||
                getAnswerResolveButtonDisabled(
                  resolveOption,
                  answerIds,
                  chosenAnswers
                )
              }
              onClick={onResolve}
            >
              <>
                Resolve{' '}
                <>
                  {getAnswerResolveButtonLabel(
                    resolveOption,
                    chosenText,
                    answerIds
                  )}
                </>
              </>
            </Button>
          )}
        </Row>
      </div>

      {!!error && <div className="text-scarlet-500">{error}</div>}
      {!!warning && <div className="text-warning">{warning}</div>}
    </Col>
  )
}

export const AnswersResolvePanel = (props: { contract: MultiContract }) => {
  const { contract } = props

  const { answers } = contract

  const isAdmin = useAdmin()
  const user = useUser()

  const [resolveOption, setResolveOption] = useState<
    'CHOOSE_ONE' | 'CHOOSE_MULTIPLE' | 'CANCEL' | undefined
  >('CHOOSE_ONE')
  const [chosenAnswers, setChosenAnswers] = useState<{
    [answerId: string]: number
  }>({})

  useEffect(() => {
    setChosenAnswers({})
  }, [resolveOption])

  const chosenTotal = sum(Object.values(chosenAnswers))

  const onChoose = (answerId: string, prob: number) => {
    if (resolveOption === 'CHOOSE_ONE') {
      setChosenAnswers({ [answerId]: prob })
    } else {
      setChosenAnswers((chosenAnswers) => {
        return {
          ...chosenAnswers,
          [answerId]: prob,
        }
      })
    }
  }

  const onDeselect = (answerId: string) => {
    setChosenAnswers((chosenAnswers) => {
      const newChosenAnswers = { ...chosenAnswers }
      delete newChosenAnswers[answerId]
      return newChosenAnswers
    })
  }

  const showChoice = contract.resolution
    ? undefined
    : resolveOption === 'CHOOSE_ONE'
    ? 'radio'
    : resolveOption === 'CHOOSE_MULTIPLE'
    ? 'checkbox'
    : undefined

  return (
    <>
      <AnswersResolveOptions
        isAdmin={isAdmin}
        isCreator={user?.id === contract.creatorId}
        contract={contract}
        resolveOption={resolveOption}
        setResolveOption={setResolveOption}
        chosenAnswers={chosenAnswers}
      />
      {answers.map((answer) => (
        <ResolutionAnswerItem
          key={answer.id}
          answer={answer}
          contract={contract}
          showChoice={showChoice}
          chosenProb={chosenAnswers[answer.id]}
          totalChosenProb={chosenTotal}
          onChoose={onChoose}
          onDeselect={onDeselect}
        />
      ))}
    </>
  )
}

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
              <Link className="relative" href={`/${user.username}`}>
                <Row className="items-center gap-2">
                  <Avatar avatarUrl={user.avatarUrl} size="2xs" />
                  <div className="truncate">{user.name}</div>
                </Row>
              </Link>
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

export const IndependentAnswersResolvePanel = (props: {
  contract: CPMMMultiContract
}) => {
  const { contract } = props

  const isAdmin = useAdmin()

  const { answers } = contract
  const sortedAnswers = [
    ...sortBy(
      answers,
      (a) => (a.resolution ? -a.subsidyPool : -Infinity),
      (a) => -1 * a.prob
    ),
  ]

  return (
    <>
      {sortedAnswers.map((answer) => (
        <IndependentResolutionAnswerItem
          key={answer.id}
          contract={contract}
          answer={answer}
          color={getAnswerColor(
            answer,
            contract.answers.map((a) => a.text)
          )}
          isAdmin={isAdmin}
        />
      ))}
    </>
  )
}

function IndependentResolutionAnswerItem(props: {
  contract: CPMMMultiContract
  answer: Answer
  color: string
  isAdmin: boolean
  isInModal?: boolean
}) {
  const { contract, answer, color, isAdmin } = props
  const answerCreator = useUserByIdOrAnswer(answer)
  const user = useUser()
  const isCreator = user?.id === contract.creatorId

  const prob = getAnswerProbability(contract, answer.id)

  const isOther = 'isOther' in answer && answer.isOther
  const addAnswersMode = contract.addAnswersMode ?? 'DISABLED'

  return (
    <AnswerBar
      color={color}
      prob={prob}
      label={
        isOther ? (
          <span>
            Other{' '}
            <InfoTooltip
              className="!text-ink-600"
              text="Represents all answers not listed. New answers are split out of this answer."
            />
          </span>
        ) : (
          <AnswerLabel
            text={answer.text}
            index={'index' in answer ? answer.index : undefined}
            createdTime={answer.createdTime}
            creator={
              addAnswersMode === 'ANYONE' ? answerCreator ?? false : undefined
            }
            className={clsx(
              'items-center text-sm !leading-none sm:flex sm:text-base'
            )}
          />
        )
      }
      end={
        <AnswerStatusAndBetButtons
          contract={contract}
          answer={answer}
          userBets={[]}
          noBetButtons
        />
      }
      bottom={
        !answer.resolution && (
          <MiniResolutionPanel
            contract={contract}
            answer={answer}
            isAdmin={isAdmin}
            isCreator={isCreator}
          />
        )
      }
    />
  )
}
