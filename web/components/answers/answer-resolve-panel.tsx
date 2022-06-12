import clsx from 'clsx'
import { sum, mapValues } from 'lodash'
import { useState } from 'react'

import { Contract, FreeResponse } from 'common/contract'
import { Col } from '../layout/col'
import { resolveMarket } from 'web/lib/firebase/fn-call'
import { Row } from '../layout/row'
import { ChooseCancelSelector } from '../yes-no-selector'
import { ResolveConfirmationButton } from '../confirmation-button'
import { removeUndefinedProps } from 'common/util/object'

export function AnswerResolvePanel(props: {
  contract: Contract & FreeResponse
  resolveOption: 'CHOOSE' | 'CHOOSE_MULTIPLE' | 'CANCEL' | undefined
  setResolveOption: (
    option: 'CHOOSE' | 'CHOOSE_MULTIPLE' | 'CANCEL' | undefined
  ) => void
  chosenAnswers: { [answerId: string]: number }
}) {
  const { contract, resolveOption, setResolveOption, chosenAnswers } = props
  const answers = Object.keys(chosenAnswers)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const onResolve = async () => {
    if (resolveOption === 'CHOOSE' && answers.length !== 1) return
    if (resolveOption === 'CHOOSE_MULTIPLE' && answers.length < 2) return

    setIsSubmitting(true)

    const totalProb = sum(Object.values(chosenAnswers))
    const normalizedProbs = mapValues(
      chosenAnswers,
      (prob) => (100 * prob) / totalProb
    )

    const resolutionProps = removeUndefinedProps({
      outcome:
        resolveOption === 'CHOOSE'
          ? answers[0]
          : resolveOption === 'CHOOSE_MULTIPLE'
          ? 'MKT'
          : 'CANCEL',
      resolutions:
        resolveOption === 'CHOOSE_MULTIPLE' ? normalizedProbs : undefined,
      contractId: contract.id,
    })

    const result = await resolveMarket(resolutionProps).then((r) => r.data)

    console.log('resolved', resolutionProps, 'result:', result)

    if (result?.status !== 'success') {
      setError(result?.message || 'Error resolving market')
    }
    setResolveOption(undefined)
    setIsSubmitting(false)
  }

  const resolutionButtonClass =
    resolveOption === 'CANCEL'
      ? 'bg-yellow-400 dark:bg-yellow-600 hover:bg-yellow-500'
      : resolveOption === 'CHOOSE' && answers.length
      ? 'btn-primary'
      : resolveOption === 'CHOOSE_MULTIPLE' &&
        answers.length > 1 &&
        answers.every((answer) => chosenAnswers[answer] > 0)
      ? 'bg-blue-400 dark:bg-blue-600 hover:bg-blue-500'
      : 'btn-disabled'

  return (
    <Col className="gap-4 rounded">
      <div>Resolve your market</div>
      <Col className="gap-4 sm:flex-row sm:items-center">
        <ChooseCancelSelector
          className="sm:!flex-row sm:items-center"
          selected={resolveOption}
          onSelect={setResolveOption}
        />

        <Row
          className={clsx(
            'flex-1 items-center',
            resolveOption ? 'justify-between' : 'justify-end'
          )}
        >
          {resolveOption && (
            <button
              className="btn btn-ghost"
              onClick={() => {
                setResolveOption(undefined)
              }}
            >
              Clear
            </button>
          )}
          <ResolveConfirmationButton
            onResolve={onResolve}
            isSubmitting={isSubmitting}
            openModalButtonClass={resolutionButtonClass}
            submitButtonClass={resolutionButtonClass}
          />
        </Row>
      </Col>

      {!!error && <div className="text-red-500">{error}</div>}
    </Col>
  )
}
