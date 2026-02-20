import { sortBy, sum } from 'lodash'
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { MultiContract } from 'common/contract'
import { Col } from '../layout/col'
import { APIError, api } from 'web/lib/api/api'
import { Row } from '../layout/row'
import { ChooseCancelSelector } from '../bet/yes-no-selector'
import { ResolveConfirmationButton } from '../buttons/confirmation-button'
import { removeUndefinedProps } from 'common/util/object'
import { BETTORS } from 'common/user'
import { Button } from '../buttons/button'
import { useUser } from 'web/hooks/use-user'
import { Answer, OTHER_TOOLTIP_TEXT } from 'common/answer'
import { getAnswerProbability } from 'common/calculate'
import { useDisplayUserByIdOrAnswer } from 'web/hooks/use-user-supabase'
import { ResolutionExplainer, ResolveHeader } from '../resolution-panel'
import { InfoTooltip } from '../widgets/info-tooltip'
import {
  AnswerBar,
  CreatorAndAnswerLabel,
  AnswerStatus,
  ClosedProb,
  OpenProb,
} from './answer-components'
import { useAdmin } from 'web/hooks/use-admin'
import { AmountInput } from '../widgets/amount-input'
import { getAnswerColor } from '../charts/contract/choice'
import { YesNoCancelSelector } from '../bet/yes-no-selector'
import { resolution } from 'common/contract'
import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { GradientContainer } from '../widgets/gradient-container'

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
  const answerIds = Object.keys(chosenAnswers)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const answer = contract.answers.find((a) => a.id === answerIds[0])
  const chosenText = answer?.text ?? 'an answer'

  const onResolve = async () => {
    if (resolveOption === 'CHOOSE_ONE' && answerIds.length !== 1) return
    if (resolveOption === 'CHOOSE_MULTIPLE' && answerIds.length < 2) return

    setIsSubmitting(true)

    const totalProb = sum(Object.values(chosenAnswers))
    const resolutions = Object.entries(chosenAnswers).map(([answerId, p]) => {
      return { answerId, pct: (100 * p) / totalProb }
    })

    const resolutionProps = removeUndefinedProps({
      contractId: contract.id,
      outcome: resolveOption,
      resolutions:
        resolveOption === 'CHOOSE_MULTIPLE' ? resolutions : undefined,
      answerId: resolveOption === 'CHOOSE_ONE' ? answerIds[0] : undefined,
    })

    try {
      // NOTE(James): I don't understand why this doesn't work without the cast to any.
      const result = await api(
        'market/:contractId/resolve',
        resolutionProps as any
      )
      console.log('resolved', resolutionProps, 'result:', result)
    } catch (e) {
      if (e instanceof APIError) {
        const message = e.message.toString()
        // Check for serialization errors and display friendly message
        if (
          message.toLowerCase().includes('could not serialize access') ||
          message
            .toLowerCase()
            .includes('serialize access due to read/write dependencies')
        ) {
          setError(
            'The server is busy. Please try resolving again in a moment.'
          )
        } else {
          setError(message)
        }
      } else {
        // Also check non-APIError cases (raw database errors)
        const errorMessage = String(e)
        if (
          errorMessage.toLowerCase().includes('could not serialize access') ||
          errorMessage
            .toLowerCase()
            .includes('serialize access due to read/write dependencies')
        ) {
          setError(
            'The server is busy. Please try resolving again in a moment.'
          )
        } else {
          console.error(e)
          setError('Error resolving question')
        }
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
              size="xl"
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
        <div className="text-warning">{`Cancel all trades and return mana back to ${BETTORS}. You repay earned fees.`}</div>
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
  const answers = contract.answers

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
    'addAnswersMode' in contract ? contract.addAnswersMode : 'DISABLED'
  const showAvatars =
    addAnswersMode === 'ANYONE' ||
    answers.some((a) => a.userId !== contract.creatorId)

  return (
    <Col className="gap-3">
      <ResolveHeader
        contract={contract}
        isCreator={user?.id === contract.creatorId}
        onClose={onClose}
        fullTitle={!inModal}
      />
      {!contract.shouldAnswersSumToOne ? (
        <div className="text-ink-500">wrong resolution panel</div>
      ) : (
        <>
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
        </>
      )}
      <ResolutionExplainer />
    </Col>
  )
}

export function ResolutionAnswerItem(props: {
  answer: Answer
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
  const user = useDisplayUserByIdOrAnswer(answer)
  const isChosen = chosenProb !== undefined

  const prob = getAnswerProbability(contract, answer.id)

  const chosenShare =
    chosenProb && totalChosenProb ? chosenProb / totalChosenProb : 0

  const color = getAnswerColor(answer)

  return (
    <AnswerBar
      color={color}
      prob={prob}
      resolvedProb={chosenShare}
      label={
        <CreatorAndAnswerLabel
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
            <OpenProb contract={contract} answer={answer} />
          )}

          {showChoice === 'checkbox' && (
            <AmountInput
              inputClassName="w-12 h-7 !px-2"
              label=""
              amount={chosenProb ? Math.round(chosenProb) : undefined}
              onChangeAmount={(value) =>
                onChoose(answer.id, value ? value : undefined)
              }
              disableClearButton
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
  contract: MultiContract
  onClose: () => void
  // If you remove this, the hiding after clearing the resolutions will be janky
  show: boolean
}) => {
  const { contract, onClose, show } = props

  const isAdmin = useAdmin()
  const user = useUser()

  const { answers } = contract
  const sortedAnswers = getSortedIndependentAnswers(contract)

  // Track resolutions for batch submission
  const [selectedResolutions, setSelectedResolutions] =
    usePersistentInMemoryState<{
      [answerId: string]: resolution
    }>({}, 'selectedResolutions')
  const [isShowingConfirmation, setIsShowingConfirmation] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [completedResolutions, setCompletedResolutions] =
    usePersistentInMemoryState<string[]>([], 'completedResolutions')
  const [resolutionProbs, setResolutionProbs] = usePersistentInMemoryState<{
    [answerId: string]: number | undefined
  }>({}, 'resolutionProbs')

  const handleSelectResolution = (answerId: string, resolution: resolution) => {
    setSelectedResolutions((prev) => ({
      ...prev,
      [answerId]: resolution,
    }))

    // Reset probability if not MKT
    if (resolution !== 'MKT') {
      setResolutionProbs((prev) => {
        const updated = { ...prev }
        delete updated[answerId]
        return updated
      })
    }
  }

  const handleRemoveResolution = (answerId: string) => {
    setSelectedResolutions((prev) => {
      const updated = { ...prev }
      delete updated[answerId]
      return updated
    })

    // Also remove probability if exists
    setResolutionProbs((prev) => {
      const updated = { ...prev }
      delete updated[answerId]
      return updated
    })
  }

  const handleSetResolutionProb = (answerId: string, prob?: number) => {
    setResolutionProbs((prev) => ({
      ...prev,
      [answerId]: prob, // Default to 50% if undefined
    }))
  }

  const selectedCount = Object.keys(selectedResolutions).length

  const submitBatchResolutions = async () => {
    setIsSubmitting(true)
    setError(undefined)

    try {
      // Process resolutions sequentially
      for (const [answerId, outcome] of Object.entries(selectedResolutions)) {
        // Skip already resolved answers
        if (completedResolutions.includes(answerId)) {
          continue
        }
        if (outcome === 'MKT') {
          if (!resolutionProbs[answerId]) {
            setError(
              `Please set a probability for ${
                answers.find((a) => a.id === answerId)?.text
              }`
            )
            break
          }
        }
        try {
          await api('market/:contractId/resolve', {
            contractId: contract.id,
            outcome,
            answerId,
            probabilityInt:
              outcome === 'MKT' ? resolutionProbs[answerId] : undefined,
          })

          // Mark this resolution as completed
          setCompletedResolutions((prev) => [...prev, answerId])
        } catch (e) {
          if (e instanceof APIError) {
            const message = e.message.toString()
            // Check for serialization errors and display friendly message
            if (
              message.toLowerCase().includes('could not serialize access') ||
              message
                .toLowerCase()
                .includes('serialize access due to read/write dependencies')
            ) {
              setError(
                'The server is busy. Please try resolving again in a moment.'
              )
            } else {
              setError(`Error resolving answer: ${message}`)
            }
          } else {
            // Also check non-APIError cases (raw database errors)
            const errorMessage = String(e)
            if (
              errorMessage
                .toLowerCase()
                .includes('could not serialize access') ||
              errorMessage
                .toLowerCase()
                .includes('serialize access due to read/write dependencies')
            ) {
              setError(
                'The server is busy. Please try resolving again in a moment.'
              )
            } else {
              setError('Error resolving answer: Unknown error')
            }
          }
          break
        }
      }
    } catch (e) {
      if (e instanceof APIError) {
        const message = e.message.toString()
        // Check for serialization errors and display friendly message
        if (
          message.toLowerCase().includes('could not serialize access') ||
          message
            .toLowerCase()
            .includes('serialize access due to read/write dependencies')
        ) {
          setError(
            'The server is busy. Please try resolving again in a moment.'
          )
        } else {
          setError(message)
        }
      } else {
        // Also check non-APIError cases (raw database errors)
        const errorMessage = String(e)
        if (
          errorMessage.toLowerCase().includes('could not serialize access') ||
          errorMessage
            .toLowerCase()
            .includes('serialize access due to read/write dependencies')
        ) {
          setError(
            'The server is busy. Please try resolving again in a moment.'
          )
        } else {
          console.error(e)
          setError('Error resolving answers')
        }
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDone = () => {
    // Clear all resolution state
    setSelectedResolutions({})
    setCompletedResolutions([])
    setResolutionProbs({})
    setIsShowingConfirmation(false)

    // Close the panel
    onClose()
  }
  if (!show) return null

  if (isShowingConfirmation) {
    const allResolutionIds = Object.keys(selectedResolutions)
    const isProcessing = isSubmitting
    const hasCompletedAll =
      !isSubmitting &&
      completedResolutions.length === allResolutionIds.length &&
      allResolutionIds.length > 0

    // Calculate remaining answers to resolve
    const remainingAnswers = allResolutionIds.filter(
      (id) => !completedResolutions.includes(id)
    )
    const hasPartiallyCompleted =
      completedResolutions.length > 0 && remainingAnswers.length > 0

    return (
      <GradientContainer>
        <Col className="gap-3">
          <div className="text-lg font-semibold">
            {!isProcessing && !hasCompletedAll && !hasPartiallyCompleted
              ? 'Confirm Resolution'
              : !isProcessing && hasPartiallyCompleted
              ? 'Continue Resolution'
              : isProcessing
              ? 'Processing Resolutions...'
              : 'Resolutions Complete'}
          </div>

          <div>
            {!isProcessing && !hasCompletedAll && !hasPartiallyCompleted
              ? 'You are about to resolve the following answers:'
              : !isProcessing && hasPartiallyCompleted
              ? `${completedResolutions.length} answer(s) resolved. Continue with remaining ${remainingAnswers.length}`
              : isProcessing
              ? 'Processing your selected resolutions:'
              : 'All resolutions have been processed successfully:'}
          </div>

          <div className="border-ink-200 max-h-60 overflow-y-auto rounded border p-2">
            {Object.entries(selectedResolutions).map(
              ([answerId, resolution]) => {
                const answer = answers.find((a) => a.id === answerId)
                if (!answer) return null

                const isCompleted = completedResolutions.includes(answerId)
                const isCurrentlyProcessing =
                  isSubmitting &&
                  !isCompleted &&
                  completedResolutions.length ===
                    allResolutionIds.indexOf(answerId)

                return (
                  <div
                    key={answerId}
                    className="border-ink-100 flex items-center justify-between border-b py-2 last:border-0"
                  >
                    <div className="font-medium">{answer.text}</div>
                    <Row className="items-center gap-2">
                      <div
                        className={clsx(
                          'font-semibold',
                          resolution === 'YES'
                            ? 'text-green-500'
                            : resolution === 'NO'
                            ? 'text-red-500'
                            : resolution === 'CANCEL'
                            ? 'text-yellow-500'
                            : 'text-blue-500'
                        )}
                      >
                        {resolution}
                        {resolution === 'MKT' &&
                          resolutionProbs[answerId] &&
                          ` ${resolutionProbs[answerId]}%`}
                      </div>

                      {isCompleted && (
                        <div className="ml-2 text-sm font-medium text-green-500">
                          ✓ Completed
                        </div>
                      )}

                      {isCurrentlyProcessing && (
                        <div className="text-ink-500 ml-2 animate-pulse text-sm font-medium">
                          Processing...
                        </div>
                      )}
                    </Row>
                  </div>
                )
              }
            )}
          </div>
          {error && <div className="text-scarlet-500 p-3">{error}</div>}
          <Row className="justify-end gap-3">
            {!isSubmitting && !hasCompletedAll && (
              <Button
                color="gray"
                onClick={() => setIsShowingConfirmation(false)}
              >
                Back
              </Button>
            )}

            {!isSubmitting && !hasCompletedAll && (
              <Button color="indigo" onClick={submitBatchResolutions}>
                {hasPartiallyCompleted
                  ? 'Continue Resolving'
                  : 'Submit All Resolutions'}
              </Button>
            )}

            {hasCompletedAll && (
              <Button color="green" onClick={handleDone}>
                Done
              </Button>
            )}

            {isProcessing && (
              <Button color="indigo" disabled loading>
                Processing...
              </Button>
            )}
          </Row>
        </Col>
      </GradientContainer>
    )
  }

  return (
    <GradientContainer>
      <Col className="gap-3">
        <ResolveHeader
          contract={contract}
          isCreator={user?.id === contract.creatorId}
          onClose={onClose}
        />

        <Row className="bg-primary-50 items-center justify-between rounded p-3">
          <div>
            <span className="font-medium">{selectedCount}</span> answer
            {selectedCount !== 1 ? 's' : ''} selected for resolution
          </div>
          <Button
            color="indigo"
            disabled={selectedCount === 0}
            onClick={() => setIsShowingConfirmation(true)}
          >
            Review & Submit
          </Button>
        </Row>

        <Col className="gap-2">
          {sortedAnswers.map((answer) => (
            <IndependentResolutionAnswerItem
              key={answer.id}
              contract={contract}
              answer={answer}
              color={getAnswerColor(answer)}
              isAdmin={isAdmin}
              selectedResolution={selectedResolutions[answer.id]}
              resolutionProb={resolutionProbs[answer.id]}
              onSelectResolution={handleSelectResolution}
              onRemoveResolution={handleRemoveResolution}
              onSetResolutionProb={handleSetResolutionProb}
            />
          ))}
        </Col>
        <ResolutionExplainer independentMulti />
      </Col>
    </GradientContainer>
  )
}

const getSortedIndependentAnswers = (contract: MultiContract) => {
  const { answers, addAnswersMode } = contract
  return sortBy(
    answers,
    (a) => (a.resolution ? -a.subsidyPool : -Infinity),
    (a) => (addAnswersMode === 'ANYONE' ? -1 * a.prob : a.index)
  )
}

export const IndependentAnswersUnresolvePanel = (props: {
  contract: MultiContract
  onClose: () => void
  show: boolean
}) => {
  const { contract, onClose, show } = props
  const user = useUser()
  const sortedAnswers = getSortedIndependentAnswers(contract)
  const [selectedAnswerIds, setSelectedAnswerIds] = useState<string[]>([])
  const [isShowingConfirmation, setIsShowingConfirmation] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [completedAnswerIds, setCompletedAnswerIds] = useState<string[]>([])

  useEffect(() => {
    if (!show) return
    setSelectedAnswerIds([])
    setIsShowingConfirmation(false)
    setError(undefined)
    setCompletedAnswerIds([])
  }, [show])

  if (!show) return null

  const toggleAnswer = (answerId: string) => {
    setSelectedAnswerIds((ids) =>
      ids.includes(answerId)
        ? ids.filter((id) => id !== answerId)
        : [...ids, answerId]
    )
  }

  const unresolveAnswers = async () => {
    if (isSubmitting || selectedAnswerIds.length === 0) return
    setIsSubmitting(true)
    setError(undefined)
    try {
      const nextCompleted: string[] = [...completedAnswerIds]
      for (const answerId of selectedAnswerIds) {
        if (nextCompleted.includes(answerId)) continue
        await api('unresolve', { contractId: contract.id, answerId })
        nextCompleted.push(answerId)
        setCompletedAnswerIds([...nextCompleted])
      }
    } catch (e) {
      if (e instanceof APIError) {
        setError(e.message.toString())
      } else {
        setError('Failed to unresolve answers')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const hasCompletedAll =
    !isSubmitting &&
    selectedAnswerIds.length > 0 &&
    completedAnswerIds.length === selectedAnswerIds.length
  const remainingAnswerIds = selectedAnswerIds.filter(
    (id) => !completedAnswerIds.includes(id)
  )
  const hasPartiallyCompleted =
    completedAnswerIds.length > 0 && remainingAnswerIds.length > 0

  if (isShowingConfirmation) {
    return (
      <GradientContainer>
        <Col className="gap-3">
          <div className="text-lg font-semibold">
            {!isSubmitting && !hasCompletedAll && !hasPartiallyCompleted
              ? 'Confirm Unresolution'
              : !isSubmitting && hasPartiallyCompleted
              ? 'Continue Unresolution'
              : isSubmitting
              ? 'Processing Unresolutions...'
              : 'Unresolutions Complete'}
          </div>

          <div>
            {!isSubmitting && !hasCompletedAll && !hasPartiallyCompleted
              ? 'You are about to unresolve the following answers:'
              : !isSubmitting && hasPartiallyCompleted
              ? `${completedAnswerIds.length} answer(s) unresolved. Continue with remaining ${remainingAnswerIds.length}`
              : isSubmitting
              ? 'Processing your selected unresolutions:'
              : 'All unresolutions have been processed successfully:'}
          </div>

          <div className="border-ink-200 max-h-60 overflow-y-auto rounded border p-2">
            {selectedAnswerIds.map((answerId) => {
              const answer = contract.answers.find((a) => a.id === answerId)
              if (!answer) return null
              const isCompleted = completedAnswerIds.includes(answerId)
              const isCurrentlyProcessing =
                isSubmitting &&
                !isCompleted &&
                completedAnswerIds.length === selectedAnswerIds.indexOf(answerId)

              return (
                <div
                  key={answerId}
                  className="border-ink-100 flex items-center justify-between border-b py-2 last:border-0"
                >
                  <div className="font-medium">{answer.text}</div>
                  <Row className="items-center gap-2">
                    <div className="text-ink-500 text-sm font-semibold">
                      UNRESOLVE
                    </div>
                    {isCompleted && (
                      <div className="ml-2 text-sm font-medium text-green-500">
                        ✓ Completed
                      </div>
                    )}
                    {isCurrentlyProcessing && (
                      <div className="text-ink-500 ml-2 animate-pulse text-sm font-medium">
                        Processing...
                      </div>
                    )}
                  </Row>
                </div>
              )
            })}
          </div>

          {error && <div className="text-scarlet-500 p-3">{error}</div>}

          <Row className="justify-end gap-3">
            {!isSubmitting && !hasCompletedAll && (
              <Button color="gray" onClick={() => setIsShowingConfirmation(false)}>
                Back
              </Button>
            )}
            {!isSubmitting && !hasCompletedAll && (
              <Button
                color={hasPartiallyCompleted ? 'indigo' : 'red-outline'}
                onClick={unresolveAnswers}
              >
                {hasPartiallyCompleted
                  ? 'Continue Unresolving'
                  : 'Submit All Unresolutions'}
              </Button>
            )}
            {hasCompletedAll && (
              <Button color="green" onClick={onClose}>
                Done
              </Button>
            )}
            {isSubmitting && (
              <Button color="indigo" disabled loading>
                Processing...
              </Button>
            )}
          </Row>
        </Col>
      </GradientContainer>
    )
  }

  return (
    <GradientContainer>
      <Col className="gap-3">
        <Row className="justify-end">
          <Button onClick={onClose} color="gray-white">
            Close
          </Button>
        </Row>
        <div className="text-lg">
          Unresolve answers for "{contract.question}"
        </div>
        <div className="text-ink-600 text-sm">
          Select resolved answers to unresolve. This is serious business and
          undoes payouts for selected answers.
        </div>

        <Row className="bg-primary-50 items-center justify-between rounded p-3">
          <div>
            <span className="font-medium">{selectedAnswerIds.length}</span>{' '}
            answer{selectedAnswerIds.length === 1 ? '' : 's'} selected to
            unresolve
          </div>
          <Button
            color="indigo"
            disabled={selectedAnswerIds.length === 0}
            onClick={() => setIsShowingConfirmation(true)}
          >
            Review & Submit
          </Button>
        </Row>

        {!!error && <div className="text-scarlet-500 p-2">{error}</div>}

        <Col className="gap-2">
          {sortedAnswers.map((answer) => (
            <IndependentUnresolveAnswerItem
              key={answer.id}
              contract={contract}
              answer={answer}
              color={getAnswerColor(answer)}
              isSelected={selectedAnswerIds.includes(answer.id)}
              onToggle={toggleAnswer}
            />
          ))}
        </Col>
      </Col>
    </GradientContainer>
  )
}

function IndependentResolutionAnswerItem(props: {
  contract: MultiContract
  answer: Answer
  color: string
  isAdmin: boolean
  selectedResolution?: resolution
  resolutionProb?: number
  onSelectResolution: (answerId: string, resolution: resolution) => void
  onRemoveResolution: (answerId: string) => void
  onSetResolutionProb: (answerId: string, prob?: number) => void
}) {
  const {
    contract,
    answer,
    color,
    isAdmin,
    selectedResolution,
    resolutionProb,
    onSelectResolution,
    onRemoveResolution,
    onSetResolutionProb,
  } = props

  const answerCreator = useDisplayUserByIdOrAnswer(answer)
  const user = useUser()
  const isCreator = user?.id === contract.creatorId

  const prob = getAnswerProbability(contract, answer.id)

  const addAnswersMode = contract.addAnswersMode ?? 'DISABLED'

  // Skip already resolved answers
  if (answer.resolution) {
    return (
      <Col>
        <AnswerBar
          color={color}
          prob={prob}
          label={
            <Row className={'items-center gap-1'}>
              <AnswerStatus contract={contract} answer={answer} />
              {answer.isOther ? (
                <span>
                  Other{' '}
                  <InfoTooltip
                    className="!text-ink-600"
                    text={OTHER_TOOLTIP_TEXT}
                  />
                </span>
              ) : (
                <CreatorAndAnswerLabel
                  text={answer.text}
                  createdTime={answer.createdTime}
                  creator={
                    addAnswersMode === 'ANYONE'
                      ? answerCreator ?? false
                      : undefined
                  }
                  className={clsx(
                    'items-center text-sm !leading-none sm:text-base'
                  )}
                />
              )}
            </Row>
          }
          end={null}
        />
      </Col>
    )
  }

  const handleOutcomeSelect = (outcome: resolution | undefined) => {
    if (!outcome) {
      onRemoveResolution(answer.id)
    } else {
      onSelectResolution(answer.id, outcome)

      // Set default probability if MKT selected
      if (outcome === 'MKT' && !resolutionProb) {
        onSetResolutionProb(answer.id, Math.round(prob * 100))
      }
    }
  }

  return (
    <Col>
      <AnswerBar
        color={color}
        prob={prob}
        label={
          <Row className={'items-center gap-1'}>
            <AnswerStatus contract={contract} answer={answer} />
            {answer.isOther ? (
              <span>
                Other{' '}
                <InfoTooltip
                  className="!text-ink-600"
                  text={OTHER_TOOLTIP_TEXT}
                />
              </span>
            ) : (
              <CreatorAndAnswerLabel
                text={answer.text}
                createdTime={answer.createdTime}
                creator={
                  addAnswersMode === 'ANYONE'
                    ? answerCreator ?? false
                    : undefined
                }
                className={clsx(
                  'items-center text-sm !leading-none sm:text-base'
                )}
              />
            )}
          </Row>
        }
        end={
          selectedResolution ? (
            <div
              className={clsx(
                'text-sm font-semibold',
                selectedResolution === 'YES'
                  ? 'text-green-500'
                  : selectedResolution === 'NO'
                  ? 'text-red-500'
                  : selectedResolution === 'CANCEL'
                  ? 'text-yellow-500'
                  : 'text-blue-500'
              )}
            >
              {selectedResolution}
              {selectedResolution === 'MKT' &&
                resolutionProb &&
                ` ${resolutionProb}%`}
            </div>
          ) : null
        }
      />
      <div className="mt-2">
        <Row className="flex-wrap gap-4">
          {isAdmin && !isCreator && (
            <div className="bg-scarlet-50 text-scarlet-500 self-start rounded p-1 text-xs">
              ADMIN
            </div>
          )}
          <YesNoCancelSelector
            selected={selectedResolution as resolution | undefined}
            onSelect={handleOutcomeSelect}
          />

          {selectedResolution === 'MKT' && (
            <Row className="items-center gap-2">
              <span className="text-ink-500 text-sm">Resolve to</span>
              <AmountInput
                inputClassName="w-20 h-9"
                label="%"
                amount={resolutionProb ? Math.round(resolutionProb) : undefined}
                onChangeAmount={(value) =>
                  onSetResolutionProb(answer.id, value ? value : undefined)
                }
                disableClearButton
              />
            </Row>
          )}

          {selectedResolution && (
            <Button
              color="gray"
              size="xs"
              onClick={() => onRemoveResolution(answer.id)}
            >
              Remove
            </Button>
          )}
        </Row>
      </div>
      <hr className="border-ink-300 mb-2 mt-4" />
    </Col>
  )
}

function IndependentUnresolveAnswerItem(props: {
  contract: MultiContract
  answer: Answer
  color: string
  isSelected: boolean
  onToggle: (answerId: string) => void
}) {
  const { contract, answer, color, isSelected, onToggle } = props
  const answerCreator = useDisplayUserByIdOrAnswer(answer)
  const addAnswersMode = contract.addAnswersMode ?? 'DISABLED'
  const prob = getAnswerProbability(contract, answer.id)
  const isResolved = !!answer.resolution

  return (
    <Col>
      <AnswerBar
        color={color}
        prob={prob}
        label={
          <Row className={'items-center gap-1'}>
            <AnswerStatus contract={contract} answer={answer} />
            {answer.isOther ? (
              <span>
                Other{' '}
                <InfoTooltip className="!text-ink-600" text={OTHER_TOOLTIP_TEXT} />
              </span>
            ) : (
              <CreatorAndAnswerLabel
                text={answer.text}
                createdTime={answer.createdTime}
                creator={
                  addAnswersMode === 'ANYONE' ? answerCreator ?? false : undefined
                }
                className={clsx('items-center text-sm !leading-none sm:text-base')}
              />
            )}
          </Row>
        }
        end={
          isResolved ? (
            <input
              className={clsx('checked:!bg-purple-500')}
              type="checkbox"
              name="unresolve-opt"
              checked={isSelected}
              onChange={() => onToggle(answer.id)}
              value={answer.id}
            />
          ) : (
            <span className="text-ink-500 text-xs">Not resolved</span>
          )
        }
      />
    </Col>
  )
}
