import { sum } from 'lodash'
import { useEffect, useState } from 'react'

import { FreeResponseContract, MultipleChoiceContract } from 'common/contract'
import { Col } from '../layout/col'
import { APIError, resolveMarket } from 'web/lib/firebase/api'
import { Row } from '../layout/row'
import { ChooseCancelSelector } from '../bet/yes-no-selector'
import { ResolveConfirmationButton } from '../buttons/confirmation-button'
import { removeUndefinedProps } from 'common/util/object'
import { BETTORS } from 'common/user'
import { Button } from '../buttons/button'

export function AnswerResolvePanel(props: {
  isAdmin: boolean
  isCreator: boolean
  contract: FreeResponseContract | MultipleChoiceContract
  resolveOption: 'CHOOSE' | 'CHOOSE_MULTIPLE' | 'CANCEL' | undefined
  setResolveOption: (
    option: 'CHOOSE' | 'CHOOSE_MULTIPLE' | 'CANCEL' | undefined
  ) => void
  chosenAnswers: { [answerId: string]: number }
}) {
  const {
    contract,
    resolveOption,
    setResolveOption,
    chosenAnswers,
    isAdmin,
    isCreator,
  } = props
  const answers = Object.keys(chosenAnswers)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [warning, setWarning] = useState<string | undefined>(undefined)

  const chosenText =
    contract.answers[
      (contract.outcomeType === 'FREE_RESPONSE' ? -1 : 0) + parseInt(answers[0])
    ]?.text ?? 'an answer'

  useEffect(() => {
    if (resolveOption === 'CANCEL') {
      setWarning(`Cancel all trades and return money back to ${BETTORS}.`)
    } else {
      setWarning(undefined)
    }
  }, [resolveOption])

  const onResolve = async () => {
    if (resolveOption === 'CHOOSE' && answers.length !== 1) return
    if (resolveOption === 'CHOOSE_MULTIPLE' && answers.length < 2) return

    setIsSubmitting(true)

    const totalProb = sum(Object.values(chosenAnswers))
    const resolutions = Object.entries(chosenAnswers).map(([i, p]) => {
      return { answer: parseInt(i), pct: (100 * p) / totalProb }
    })

    const resolutionProps = removeUndefinedProps({
      outcome:
        resolveOption === 'CHOOSE'
          ? parseInt(answers[0])
          : resolveOption === 'CHOOSE_MULTIPLE'
          ? 'MKT'
          : 'CANCEL',
      resolutions:
        resolveOption === 'CHOOSE_MULTIPLE' ? resolutions : undefined,
      contractId: contract.id,
    })

    try {
      const result = await resolveMarket(resolutionProps)
      console.log('resolved', resolutionProps, 'result:', result)
    } catch (e) {
      if (e instanceof APIError) {
        setError(e.toString())
      } else {
        console.error(e)
        setError('Error resolving market')
      }
    }

    setResolveOption(undefined)
    setIsSubmitting(false)
  }

  return (
    <Col className="gap-4 rounded">
      <Row className="justify-between">
        <div>Resolve your market</div>
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

          <ResolveConfirmationButton
            color={
              resolveOption === 'CANCEL'
                ? 'yellow'
                : resolveOption === 'CHOOSE' && answers.length
                ? 'green'
                : resolveOption === 'CHOOSE_MULTIPLE' &&
                  answers.length > 1 &&
                  answers.every((answer) => chosenAnswers[answer] > 0)
                ? 'blue'
                : 'indigo'
            }
            label={
              resolveOption === 'CANCEL'
                ? 'N/A'
                : resolveOption === 'CHOOSE'
                ? chosenText
                : `${answers.length} answers`
            }
            marketTitle={contract.question}
            disabled={
              !resolveOption ||
              (resolveOption === 'CHOOSE' && !answers.length) ||
              (resolveOption === 'CHOOSE_MULTIPLE' &&
                (!(answers.length > 1) ||
                  !answers.every((answer) => chosenAnswers[answer] > 0)))
            }
            onResolve={onResolve}
            isSubmitting={isSubmitting}
          />
        </Row>
      </div>

      {!!error && <div className="text-scarlet-500">{error}</div>}
      {!!warning && <div className="text-warning">{warning}</div>}
    </Col>
  )
}
