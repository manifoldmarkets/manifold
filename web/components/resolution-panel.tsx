import clsx from 'clsx'
import React, { useState } from 'react'
import { getFunctions, httpsCallable } from 'firebase/functions'

import { Contract } from '../lib/firebase/contracts'
import { Col } from './layout/col'
import { Title } from './title'
import { User } from '../lib/firebase/users'
import { YesNoCancelSelector } from './yes-no-selector'
import { Spacer } from './layout/spacer'
import { ConfirmationButton as ConfirmationButton } from './confirmation-button'

const functions = getFunctions()
export const resolveMarket = httpsCallable(functions, 'resolveMarket')

export function ResolutionPanel(props: {
  creator: User
  contract: Contract
  className?: string
}) {
  const { contract, className } = props

  const [outcome, setOutcome] = useState<
    'YES' | 'NO' | 'MKT' | 'CANCEL' | undefined
  >()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const resolve = async () => {
    setIsSubmitting(true)

    const result = await resolveMarket({
      outcome,
      contractId: contract.id,
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
    <Col className={clsx('bg-white shadow-md px-8 py-6 rounded-md', className)}>
      <Title className="mt-0" text="Your market" />

      <div className="pt-2 pb-1 text-sm text-gray-400">Resolve outcome</div>

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
            Winnings will be paid out to YES bettors. You earn 1% of the pool.
          </>
        ) : outcome === 'NO' ? (
          <>Winnings will be paid out to NO bettors. You earn 1% of the pool.</>
        ) : outcome === 'CANCEL' ? (
          <>The pool will be returned to traders with no fees.</>
        ) : outcome === 'MKT' ? (
          <>
            Traders will be paid out at the current implied probability. You
            earn 1% of the pool.
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
        <p>Are you sure you want to resolve this market?</p>
      </ConfirmationButton>
    </Col>
  )
}
