import clsx from 'clsx'
import React, { useEffect, useState } from 'react'

import { Contract } from '../lib/firebase/contracts'
import { Col } from './layout/col'
import { Title } from './title'
import { User } from '../lib/firebase/users'
import { YesNoCancelSelector } from './yes-no-selector'
import { Spacer } from './layout/spacer'
import { ConfirmationButton as ConfirmationButton } from './confirmation-button'
import { resolveMarket } from '../lib/firebase/api-call'
import { ProbabilitySelector } from './probability-selector'
import { getProbability } from '../../common/calculate'
import { CREATOR_FEE } from '../../common/fees'

export function ResolutionPanel(props: {
  creator: User
  contract: Contract
  className?: string
}) {
  useEffect(() => {
    // warm up cloud function
    resolveMarket({}).catch()
  }, [])

  const { contract, className } = props

  const [outcome, setOutcome] = useState<
    'YES' | 'NO' | 'MKT' | 'CANCEL' | undefined
  >()

  const [prob, setProb] = useState(getProbability(contract.totalShares) * 100)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const resolve = async () => {
    setIsSubmitting(true)

    const result = await resolveMarket({
      outcome,
      contractId: contract.id,
      probabilityInt: prob,
    }).then((r) => r.data as any)

    console.log('resolved', outcome, 'result:', result)

    if (result?.status !== 'success') {
      setError(result?.error || 'Error resolving market')
    }
    setIsSubmitting(false)
  }

  const submitButtonClass =
    outcome === 'YES'
      ? 'btn-primary'
      : outcome === 'NO'
      ? 'bg-red-400 hover:bg-red-500'
      : outcome === 'CANCEL'
      ? 'bg-yellow-400 hover:bg-yellow-500'
      : outcome === 'MKT'
      ? 'bg-blue-400 hover:bg-blue-500'
      : 'btn-disabled'

  return (
    <Col className={clsx('bg-white px-8 py-6 rounded-md', className)}>
      <Title className="mt-0" text="Your market" />

      <div className="pt-2 pb-1 text-sm text-gray-500">Resolve outcome</div>

      <YesNoCancelSelector
        className="mx-auto my-2"
        selected={outcome}
        onSelect={setOutcome}
        btnClassName={isSubmitting ? 'btn-disabled' : ''}
      />

      <Spacer h={3} />

      <div>
        {outcome === 'YES' ? (
          <>
            Winnings will be paid out to YES bettors. You earn{' '}
            {CREATOR_FEE * 100}%.
          </>
        ) : outcome === 'NO' ? (
          <>
            Winnings will be paid out to NO bettors. You earn{' '}
            {CREATOR_FEE * 100}%.
          </>
        ) : outcome === 'CANCEL' ? (
          <>The pool will be returned to traders with no fees.</>
        ) : outcome === 'MKT' ? (
          <>
            Traders will be paid out at the probability you specify. You earn{' '}
            {CREATOR_FEE * 100}%.
          </>
        ) : (
          <>Resolving this market will immediately pay out traders.</>
        )}
      </div>

      <Spacer h={3} />

      {!!error && <div className="text-red-500">{error}</div>}

      <ConfirmationButton
        id="resolution-modal"
        openModelBtn={{
          className: clsx(
            'border-none self-start mt-2 w-full',
            submitButtonClass,
            isSubmitting && 'btn-disabled loading'
          ),
          label: 'Resolve',
        }}
        cancelBtn={{
          label: 'Back',
        }}
        submitBtn={{
          label: 'Resolve',
          className: submitButtonClass,
        }}
        onSubmit={resolve}
      >
        {outcome === 'MKT' ? (
          <>
            <p className="mb-4">
              What probability would you like to resolve the market to?
            </p>

            <ProbabilitySelector
              probabilityInt={Math.round(prob)}
              setProbabilityInt={setProb}
            />
          </>
        ) : (
          <p>Are you sure you want to resolve this market?</p>
        )}
      </ConfirmationButton>
    </Col>
  )
}
