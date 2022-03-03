import clsx from 'clsx'
import React, { useEffect, useState } from 'react'

import { Contract } from '../lib/firebase/contracts'
import { Col } from './layout/col'
import { Title } from './title'
import { User } from '../lib/firebase/users'
import { YesNoCancelSelector } from './yes-no-selector'
import { Spacer } from './layout/spacer'
import { ResolveConfirmationButton } from './confirmation-button'
import { resolveMarket } from '../lib/firebase/api-call'
import { ProbabilitySelector } from './probability-selector'
import { getDpmProbability } from '../../common/calculate-dpm'
import { CREATOR_FEE } from '../../common/fees'

export function ResolutionPanel(props: {
  creator: User
  contract: Contract
  className?: string
}) {
  useEffect(() => {
    // warm up cloud function
    resolveMarket({} as any).catch()
  }, [])

  const { contract, className } = props

  const [outcome, setOutcome] = useState<
    'YES' | 'NO' | 'MKT' | 'CANCEL' | undefined
  >()

  const [prob, setProb] = useState(
    getDpmProbability(contract.totalShares) * 100
  )

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const resolve = async () => {
    if (!outcome) return

    setIsSubmitting(true)

    const result = await resolveMarket({
      outcome,
      contractId: contract.id,
      probabilityInt: prob,
    }).then((r) => r.data)

    console.log('resolved', outcome, 'result:', result)

    if (result?.status !== 'success') {
      setError(result?.message || 'Error resolving market')
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
    <Col className={clsx('rounded-md bg-white px-8 py-6', className)}>
      <Title className="mt-0 whitespace-nowrap" text="Resolve market" />

      <div className="mb-2 text-sm text-gray-500">Outcome</div>

      <YesNoCancelSelector
        className="mx-auto my-2"
        selected={outcome}
        onSelect={setOutcome}
        btnClassName={isSubmitting ? 'btn-disabled' : ''}
      />

      <Spacer h={4} />

      <div>
        {outcome === 'YES' ? (
          <>
            Winnings will be paid out to YES bettors.
            <br />
            <br />
            You earn {CREATOR_FEE * 100}% of trader profits.
          </>
        ) : outcome === 'NO' ? (
          <>
            Winnings will be paid out to NO bettors.
            <br />
            <br />
            You earn {CREATOR_FEE * 100}% of trader profits.
          </>
        ) : outcome === 'CANCEL' ? (
          <>The pool will be returned to traders with no fees.</>
        ) : outcome === 'MKT' ? (
          <Col className="gap-6">
            <div>Traders will be paid out at the probability you specify:</div>
            <ProbabilitySelector
              probabilityInt={Math.round(prob)}
              setProbabilityInt={setProb}
            />
            <div>You earn {CREATOR_FEE * 100}% of trader profits.</div>
          </Col>
        ) : (
          <>Resolving this market will immediately pay out traders.</>
        )}
      </div>

      <Spacer h={4} />

      {!!error && <div className="text-red-500">{error}</div>}

      <ResolveConfirmationButton
        onResolve={resolve}
        isSubmitting={isSubmitting}
        openModelButtonClass={clsx('w-full mt-2', submitButtonClass)}
        submitButtonClass={submitButtonClass}
      />
    </Col>
  )
}
