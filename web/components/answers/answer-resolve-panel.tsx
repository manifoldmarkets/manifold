import { sortBy, sum } from 'lodash'
import { useEffect, useState } from 'react'
import clsx from 'clsx'

import { CPMMMultiContract, MultiContract } from 'common/contract'
import { Col } from '../layout/col'
import { APIError, resolveMarket } from 'web/lib/firebase/api'
import { Row } from '../layout/row'
import { ChooseCancelSelector } from '../bet/yes-no-selector'
import { ResolveConfirmationButton } from '../buttons/confirmation-button'
import { removeUndefinedProps } from 'common/util/object'
import { BETTORS } from 'common/user'
import { Button } from '../buttons/button'
import { useUser } from 'web/hooks/use-user'
import { DpmAnswer, Answer } from 'common/answer'
import { getAnswerProbability } from 'common/calculate'
import { useUserByIdOrAnswer } from 'web/hooks/use-user-supabase'
import { MiniResolutionPanel, ResolveHeader } from '../resolution-panel'
import { InfoTooltip } from '../widgets/info-tooltip'
import {
  AnswerBar,
  AnswerLabel,
  AnswerStatusAndBetButtons,
  ClosedProb,
  OpenProb,
} from './answer-components'
import { useAdmin } from 'web/hooks/use-admin'
import { GradientContainer } from '../widgets/gradient-container'
import { AmountInput } from '../widgets/amount-input'
import { getAnswerColor } from '../charts/contract/choice'

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
  contract: MultiContract
  resolveOption: 'CHOOSE_ONE' | 'CHOOSE_MULTIPLE' | 'CANCEL'
  setResolveOption: (
    option: 'CHOOSE_ONE' | 'CHOOSE_MULTIPLE' | 'CANCEL'
  ) => void
  chosenAnswers: { [answerId: string]: number }
  isInModal?: boolean
}) {
  const {
    contract,
    resolveOption,
    setResolveOption,
    chosenAnswers,
    isInModal,
  } = props
  const isCpmm = contract.mechanism === 'cpmm-multi-1'
  const answerIds = Object.keys(chosenAnswers)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const answer = isCpmm
    ? contract.answers.find((a) => a.id === answerIds[0])
    : contract.answers[
        (contract.outcomeType === 'FREE_RESPONSE' ? -1 : 0) +
          parseInt(answerIds[0])
      ]
  const chosenText = answer?.text ?? 'an answer'

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

    setIsSubmitting(false)
  }

  return (
    <>
      <div className="flex flex-col items-stretch justify-center gap-4 sm:flex-row sm:flex-wrap sm:justify-between">
        <ChooseCancelSelector
          selected={resolveOption}
          onSelect={setResolveOption}
        />

        <Row className="justify-end gap-1">
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
      {resolveOption === 'CANCEL' && (
        <div className="text-warning">{`Cancel all trades and return mana back to ${BETTORS}.`}</div>
      )}
    </>
  )
}

export const AnswersResolvePanel = (props: {
  contract: MultiContract
  onClose: () => void
  inModal?: boolean
}) => {
  const { contract, onClose, inModal } = props
  const { answers, outcomeType } = contract

  const user = useUser()

  const [resolveOption, setResolveOption] = useState<
    'CHOOSE_ONE' | 'CHOOSE_MULTIPLE' | 'CANCEL'
  >('CHOOSE_ONE')
  const [chosenAnswers, setChosenAnswers] = useState<{
    [answerId: string]: number
  }>({})

  useEffect(() => {
    setChosenAnswers({})
  }, [resolveOption])

  const chosenTotal = sum(Object.values(chosenAnswers))

  const onChoose = (answerId: string, prob?: number) => {
    if (resolveOption === 'CHOOSE_ONE') {
      setChosenAnswers({ [answerId]: 100 })
    } else {
      setChosenAnswers((chosenAnswers) => {
        const copy = { ...chosenAnswers }
        if (prob === undefined) {
          delete copy[answerId]
        } else {
          copy[answerId] = prob
        }
        return copy
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
  const addAnswersMode =
    'addAnswersMode' in contract
      ? contract.addAnswersMode
      : outcomeType === 'FREE_RESPONSE'
      ? 'ANYONE'
      : 'DISABLED'
  const showAvatars =
    addAnswersMode === 'ANYONE' ||
    answers.some((a) => a.userId !== contract.creatorId)

  return (
    <GradientContainer>
      <Col className="gap-3">
        <ResolveHeader
          contract={contract}
          isCreator={user?.id === contract.creatorId}
          onClose={onClose}
          fullTitle={!inModal}
        />
        <AnswersResolveOptions
          contract={contract}
          resolveOption={resolveOption}
          setResolveOption={setResolveOption}
          chosenAnswers={chosenAnswers}
        />
        <Col className="gap-2">
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
              showAvatar={showAvatars}
            />
          ))}
        </Col>
      </Col>
    </GradientContainer>
  )
}

export function ResolutionAnswerItem(props: {
  answer: DpmAnswer | Answer
  contract: MultiContract
  showChoice: 'radio' | 'checkbox' | undefined
  chosenProb: number | undefined
  totalChosenProb?: number
  onChoose: (answerId: string, prob?: number) => void
  onDeselect: (answerId: string) => void
  isInModal?: boolean
  showAvatar?: boolean
}) {
  const {
    answer,
    contract,
    showChoice,
    chosenProb,
    totalChosenProb,
    onChoose,
    onDeselect,
    showAvatar,
  } = props
  const { text } = answer
  const user = useUserByIdOrAnswer(answer)
  const isChosen = chosenProb !== undefined

  const prob = getAnswerProbability(contract, answer.id)

  const chosenShare =
    chosenProb && totalChosenProb ? chosenProb / totalChosenProb : 0

  const color = getAnswerColor(
    answer,
    contract.answers.map((a) => a.id)
  )

  return (
    <AnswerBar
      color={color}
      prob={prob}
      resolvedProb={chosenShare}
      label={
        <AnswerLabel
          text={text}
          createdTime={answer.createdTime}
          creator={showAvatar ? user ?? false : undefined}
        />
      }
      end={
        <>
          {chosenShare ? (
            <ClosedProb prob={prob} resolvedProb={chosenShare} />
          ) : (
            <OpenProb prob={prob} />
          )}

          {showChoice === 'checkbox' && (
            <AmountInput
              inputClassName="w-16 h-7 !px-2"
              label=""
              amount={chosenProb ? Math.round(chosenProb) : undefined}
              onChangeAmount={(value) =>
                onChoose(answer.id, value ? value : undefined)
              }
            />
          )}
          <>
            {showChoice === 'radio' && (
              <input
                className={clsx('checked:!bg-purple-500')}
                type="radio"
                name="opt"
                checked={isChosen}
                onChange={() => onChoose(answer.id, 1)}
                value={answer.id}
              />
            )}
            {showChoice === 'checkbox' && (
              <input
                className={clsx('checked:!bg-purple-500')}
                type="checkbox"
                name="opt"
                checked={isChosen}
                onChange={() => {
                  if (isChosen) onDeselect(answer.id)
                  else {
                    onChoose(answer.id, Math.max(100 * prob, 1))
                  }
                }}
                value={answer.id}
              />
            )}
          </>
        </>
      }
    />
  )
}

export const IndependentAnswersResolvePanel = (props: {
  contract: CPMMMultiContract
}) => {
  const { contract } = props

  const isAdmin = useAdmin()

  const { answers, addAnswersMode } = contract
  const sortedAnswers = [
    ...sortBy(
      answers,
      (a) => (a.resolution ? -a.subsidyPool : -Infinity),
      (a) => (addAnswersMode === 'ANYONE' ? -1 * a.prob : a.index)
    ),
  ]

  return (
    <>
      {sortedAnswers.map((answer) => (
        <IndependentResolutionAnswerItem
          key={answer.id}
          contract={contract}
          answer={answer}
          color={getAnswerColor(answer, [])}
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
    <Col>
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
              createdTime={answer.createdTime}
              creator={
                addAnswersMode === 'ANYONE' ? answerCreator ?? false : undefined
              }
              className={clsx(
                'items-center text-sm !leading-none sm:text-base'
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
      />
      {!answer.resolution && (
        <MiniResolutionPanel
          contract={contract}
          answer={answer}
          isAdmin={isAdmin}
          isCreator={isCreator}
        />
      )}
    </Col>
  )
}
