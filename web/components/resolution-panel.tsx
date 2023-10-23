import { useState } from 'react'
import { YesNoCancelSelector } from './bet/yes-no-selector'
import { Spacer } from './layout/spacer'
import { ResolveConfirmationButton } from './buttons/confirmation-button'
import { APIError, resolveMarket } from 'web/lib/firebase/api'
import { getAnswerProbability, getProbability } from 'common/calculate'
import {
  BinaryContract,
  CPMMMultiContract,
  Contract,
  resolution,
} from 'common/contract'
import { BETTORS } from 'common/user'
import { Row } from 'web/components/layout/row'
import { ProbabilityInput } from './widgets/probability-input'
import { Button } from './buttons/button'
import { Answer } from 'common/answer'
import { Col } from './layout/col'
import { removeUndefinedProps } from 'common/util/object'
import { XIcon } from '@heroicons/react/solid'
import { useUser } from 'web/hooks/use-user'

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
  contract: BinaryContract
  inModal?: boolean
  onClose: () => void
}) {
  const { contract, inModal, onClose } = props
  const isCreator = useUser()?.id === contract.creatorId

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
    onClose()
  }

  return (
    <>
      <ResolveHeader
        contract={contract}
        isCreator={isCreator}
        onClose={onClose}
        fullTitle={inModal}
      />

      <YesNoCancelSelector selected={outcome} onSelect={setOutcome} />

      <Spacer h={4} />
      {!!error && <div className="text-scarlet-500">{error}</div>}

      <Row className={'items-center justify-between gap-3'}>
        <div className="text-sm">
          {outcome === 'YES' ? (
            <>Pay out {BETTORS} who bought YES.</>
          ) : outcome === 'NO' ? (
            <>Pay out {BETTORS} who bought NO.</>
          ) : outcome === 'CANCEL' ? (
            <>Cancel all trades and return mana back to {BETTORS}.</>
          ) : outcome === 'MKT' ? (
            <Row className="flex-wrap items-center gap-2">
              <span>Pay out at this probability:</span>{' '}
              <ProbabilityInput
                prob={prob}
                onChange={setProb}
                className="!h-11 w-28"
              />
            </Row>
          ) : (
            <span className="text-ink-500">
              Pick the true answer and pay out {BETTORS} that got it right.
            </span>
          )}
        </div>
        {!inModal && (
          <ResolveConfirmationButton
            color={getResolveButtonColor(outcome)}
            label={getResolveButtonLabel(outcome, prob)}
            marketTitle={contract.question}
            disabled={!outcome}
            onResolve={resolve}
            isSubmitting={isSubmitting}
          />
        )}
        {inModal && (
          <Button
            color={getResolveButtonColor(outcome)}
            disabled={!outcome || isSubmitting}
            loading={isSubmitting}
            onClick={resolve}
          >
            Resolve to {getResolveButtonLabel(outcome, prob)}
          </Button>
        )}
      </Row>
    </>
  )
}

export function ResolveHeader(props: {
  fullTitle?: boolean
  contract: Contract
  isCreator: boolean
  onClose: () => void
}) {
  const { fullTitle, contract, isCreator, onClose } = props

  return (
    <div className="mb-6 flex items-start justify-between">
      <div>
        {!isCreator && (
          <span className="mr-2 rounded bg-purple-100 p-1 align-baseline text-xs uppercase text-purple-600 dark:bg-purple-900 dark:text-purple-300">
            Mod
          </span>
        )}
        Resolve{' '}
        {fullTitle
          ? `"${contract.question}"`
          : isCreator
          ? 'your question'
          : contract.creatorName + `'s question`}
      </div>
      {
        <button
          className="text-ink-500 hover:text-ink-700 py-1 pl-2 transition-colors"
          onClick={onClose}
        >
          <XIcon className="h-5 w-5" />
        </button>
      }
    </div>
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
          <div className="text-warning">Cancel trades and return mana</div>
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
