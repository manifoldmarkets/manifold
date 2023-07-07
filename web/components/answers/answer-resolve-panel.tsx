import { sum } from 'lodash'
import { useEffect, useState } from 'react'
import { MultiContract } from 'common/contract'
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
import { ResolutionAnswerItem } from './answer-item'

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

  const answers = contract.answers.filter(
    (a) => !('number' in a) || a.number !== 0
  )

  const isAdmin = useAdmin()
  const user = useUser()

  const [resolveOption, setResolveOption] = useState<
    'CHOOSE_ONE' | 'CHOOSE_MULTIPLE' | 'CANCEL' | undefined
  >()
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
