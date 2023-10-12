import { useState } from 'react'

import { User } from 'web/lib/firebase/users'
import { YesNoCancelSelector } from './bet/yes-no-selector'
import { Spacer } from './layout/spacer'
import { ResolveConfirmationButton } from './buttons/confirmation-button'
import { APIError, resolveMarket } from 'web/lib/firebase/api'
import { getAnswerProbability, getProbability } from 'common/calculate'
import { BinaryContract, CPMMMultiContract, resolution } from 'common/contract'
import { BETTORS, PLURAL_BETS } from 'common/user'
import { Row } from 'web/components/layout/row'
import { capitalize } from 'lodash'
import { ProbabilityInput } from './widgets/probability-input'
import { Button } from './buttons/button'
import { Answer } from 'common/answer'
import { Col } from './layout/col'
import { removeUndefinedProps } from 'common/util/object'

function getResolveButtonColor(outcome: resolution | undefined) {
  return outcome === 'YES'
    ? 'green'
    : outcome === 'NO'
    ? 'red'
    : outcome === 'CANCEL'
    ? 'yellow'
    : outcome === 'MKT'
    ? 'blue'
    : 'indigo'
}

function getResolveButtonLabel(
  outcome: resolution | undefined,
  prob: number | undefined
) {
  return outcome === 'CANCEL'
    ? 'N/A'
    : outcome === 'MKT'
    ? `${prob}%`
    : outcome ?? ''
}

export function ResolutionPanel(props: {
  isCreator: boolean
  creator: User
  contract: BinaryContract
  modalSetOpen?: (open: boolean) => void
}) {
  const { contract, isCreator, modalSetOpen } = props

  // const earnedFees =
  //   contract.mechanism === 'dpm-2'
  //     ? `${DPM_CREATOR_FEE * 100}% of trader profits`
  //     : `${formatMoney(contract.collectedFees.creatorFee)} in fees`

  const [outcome, setOutcome] = useState<resolution | undefined>()

  const [prob, setProb] = useState<number | undefined>(
    Math.round(getProbability(contract) * 100)
  )

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const resolve = async () => {
    if (!outcome) return

    setIsSubmitting(true)

    try {
      const result = await resolveMarket({
        outcome,
        contractId: contract.id,
        probabilityInt: prob,
      })
      console.log('resolved', outcome, 'result:', result)
    } catch (e) {
      if (e instanceof APIError) {
        setError(e.toString())
      } else {
        console.error(e)
        setError('Error resolving question')
      }
    }

    setIsSubmitting(false)
    if (modalSetOpen) {
      modalSetOpen(false)
    }
  }

  return (
    <>
      {!isCreator && (
        <span className="bg-scarlet-50 text-scarlet-500 absolute right-4 top-4 rounded p-1 text-xs">
          ADMIN
        </span>
      )}
      {!modalSetOpen && (
        <div className="mb-6">
          Resolve {isCreator ? 'your' : contract.creatorName + `'s`} question
        </div>
      )}
      {modalSetOpen && (
        <div className="mb-6">Resolve "{contract.question}"</div>
      )}
      <YesNoCancelSelector selected={outcome} onSelect={setOutcome} />

      <Spacer h={4} />
      {!!error && <div className="text-scarlet-500">{error}</div>}

      <Row className={'items-center justify-between'}>
        <div className="text-sm">
          {outcome === 'YES' ? (
            <>
              Winnings will be paid out to {BETTORS} who bought YES.
              {/* <br />
            <br />
            You will earn {earnedFees}. */}
            </>
          ) : outcome === 'NO' ? (
            <>
              Winnings will be paid out to {BETTORS} who bought NO.
              {/* <br />
            <br />
            You will earn {earnedFees}. */}
            </>
          ) : outcome === 'CANCEL' ? (
            <>Cancel all trades and return money back to {BETTORS}.</>
          ) : outcome === 'MKT' ? (
            <Row className="flex-wrap items-center gap-2">
              <span>
                {capitalize(PLURAL_BETS)} will be paid out at the probability
                you specify:
              </span>{' '}
              <ProbabilityInput
                prob={prob}
                onChange={setProb}
                className="mr-3 !h-11 w-28"
              />
            </Row>
          ) : (
            <span className="text-ink-500">
              Resolving this question will immediately pay out {BETTORS}.
            </span>
          )}
        </div>
        {!modalSetOpen && (
          <ResolveConfirmationButton
            color={getResolveButtonColor(outcome)}
            label={getResolveButtonLabel(outcome, prob)}
            marketTitle={contract.question}
            disabled={!outcome}
            onResolve={resolve}
            isSubmitting={isSubmitting}
          />
        )}
        {modalSetOpen && (
          <Button
            color={getResolveButtonColor(outcome)}
            disabled={!outcome || isSubmitting}
            loading={isSubmitting}
            onClick={resolve}
          >
            Resolve <>{getResolveButtonLabel(outcome, prob)}</>
          </Button>
        )}
      </Row>
    </>
  )
}

export function MiniResolutionPanel(props: {
  contract: CPMMMultiContract
  answer: Answer
  isAdmin: boolean
  isCreator: boolean
  modalSetOpen?: (open: boolean) => void
}) {
  const { contract, answer, isAdmin, isCreator, modalSetOpen } = props

  const [outcome, setOutcome] = useState<resolution | undefined>()

  const [prob, setProb] = useState<number | undefined>(
    Math.round(getAnswerProbability(contract, answer.id) * 100)
  )

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const resolve = async () => {
    if (!outcome) return

    setIsSubmitting(true)

    try {
      const result = await resolveMarket(
        removeUndefinedProps({
          outcome,
          contractId: contract.id,
          probabilityInt: prob,
          answerId: answer.id,
        })
      )
      console.log('resolved', outcome, 'result:', result)
    } catch (e) {
      if (e instanceof APIError) {
        setError(e.toString())
      } else {
        console.error(e)
        setError('Error resolving question')
      }
    }

    setIsSubmitting(false)
    if (modalSetOpen) {
      modalSetOpen(false)
    }
  }

  return (
    <Row className="mt-2 gap-4">
      {isAdmin && !isCreator && (
        <div className="bg-scarlet-50 text-scarlet-500 self-start rounded p-1 text-xs">
          ADMIN
        </div>
      )}
      <Col className="items-center gap-1">
        <YesNoCancelSelector selected={outcome} onSelect={setOutcome} />
        {outcome === 'MKT' && (
          <Row className="flex-wrap items-center gap-1">
            Resolve to
            <ProbabilityInput
              prob={prob}
              onChange={setProb}
              className="w-20"
              inputClassName="!h-6"
            />
          </Row>
        )}
        {outcome === 'CANCEL' && (
          <div className="text-warning">Cancel trades and return money</div>
        )}
        {error && (
          <div className="text-scarlet-500 self-start rounded p-1 text-xs">
            {error}
          </div>
        )}
      </Col>
      <ResolveConfirmationButton
        color={getResolveButtonColor(outcome)}
        label={getResolveButtonLabel(outcome, prob)}
        marketTitle={`${contract.question} - ${answer.text}`}
        disabled={!outcome}
        onResolve={resolve}
        isSubmitting={isSubmitting}
      />
    </Row>
  )
}
