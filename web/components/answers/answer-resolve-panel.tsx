import clsx from 'clsx'
import { sum } from 'lodash'
import { useEffect, useState } from 'react'

import { FreeResponseContract, MultipleChoiceContract } from 'common/contract'
import { Col } from '../layout/col'
import { APIError, resolveMarket } from 'web/lib/firebase/api'
import { Row } from '../layout/row'
import { ChooseCancelSelector } from '../yes-no-selector'
import { ResolveConfirmationButton } from '../confirmation-button'
import { removeUndefinedProps } from 'common/util/object'
import { BETTOR, PAST_BETS } from 'common/user'

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

  useEffect(() => {
    if (resolveOption === 'CANCEL') {
      setWarning(
        `All ${PAST_BETS} will be returned. Unique ${BETTOR} bonuses will be
            withdrawn from your account.`
      )
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

  // const resolutionButtonClass =
  //   resolveOption === 'CANCEL'
  //     ? 'bg-yellow-400 hover:bg-yellow-500'
  //     : resolveOption === 'CHOOSE' && answers.length
  //     ? 'btn-primary'
  //     : resolveOption === 'CHOOSE_MULTIPLE' &&
  //       answers.length > 1 &&
  //       answers.every((answer) => chosenAnswers[answer] > 0)
  //     ? 'bg-blue-400 hover:bg-blue-500'
  //     : 'btn-disabled'

  return (
    <Col className="gap-4 rounded">
      <Row className="justify-between">
        <div>Resolve your market</div>
        {isAdmin && !isCreator && (
          <span className="rounded bg-red-200 p-1 text-xs text-red-600">
            ADMIN
          </span>
        )}
      </Row>
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
      </Col>

      {!!error && <div className="text-red-500">{error}</div>}
      {!!warning && <div className="text-warning">{warning}</div>}
    </Col>
  )
}
