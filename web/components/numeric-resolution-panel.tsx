import clsx from 'clsx'
import React, { useEffect, useState } from 'react'

import { Col } from './layout/col'
import { User } from 'web/lib/firebase/users'
import { NumberCancelSelector } from './yes-no-selector'
import { Spacer } from './layout/spacer'
import { ResolveConfirmationButton } from './confirmation-button'
import { NumericContract, PseudoNumericContract } from 'common/contract'
import { APIError, resolveMarket } from 'web/lib/firebase/api-call'
import { BucketInput } from './bucket-input'
import { getPseudoProbability } from 'common/pseudo-numeric'

export function NumericResolutionPanel(props: {
  creator: User
  contract: NumericContract | PseudoNumericContract
  className?: string
}) {
  useEffect(() => {
    // warm up cloud function
    resolveMarket({} as any).catch(() => {})
  }, [])

  const { contract, className } = props
  const { min, max, outcomeType } = contract

  const [outcomeMode, setOutcomeMode] = useState<
    'NUMBER' | 'CANCEL' | undefined
  >()
  const [outcome, setOutcome] = useState<string | undefined>()
  const [value, setValue] = useState<number | undefined>()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)

  const resolve = async () => {
    const finalOutcome =
      outcomeMode === 'CANCEL'
        ? 'CANCEL'
        : outcomeType === 'PSEUDO_NUMERIC'
        ? 'MKT'
        : 'NUMBER'
    if (outcomeMode === undefined || finalOutcome === undefined) return

    setIsSubmitting(true)

    const boundedValue = Math.max(Math.min(max, value ?? 0), min)

    const probabilityInt =
      100 *
      getPseudoProbability(
        boundedValue,
        min,
        max,
        outcomeType === 'PSEUDO_NUMERIC' && contract.isLogScale
      )

    try {
      const result = await resolveMarket({
        outcome: finalOutcome,
        value,
        probabilityInt,
        contractId: contract.id,
      })
      console.log('resolved', outcome, 'result:', result)
    } catch (e) {
      if (e instanceof APIError) {
        setError(e.toString())
      } else {
        console.error(e)
        setError('Error resolving market')
      }
    }

    setIsSubmitting(false)
  }

  const submitButtonClass =
    outcomeMode === 'CANCEL'
      ? 'bg-yellow-400 hover:bg-yellow-500'
      : outcome !== undefined
      ? 'btn-primary'
      : 'btn-disabled'

  return (
    <Col className={clsx('rounded-md bg-white px-8 py-6', className)}>
      <div className="mb-6 whitespace-nowrap text-2xl">Resolve market</div>

      <div className="mb-3 text-sm text-gray-500">Outcome</div>

      <Spacer h={4} />

      <NumberCancelSelector selected={outcomeMode} onSelect={setOutcomeMode} />

      <Spacer h={4} />

      {outcomeMode === 'NUMBER' && (
        <BucketInput
          contract={contract}
          isSubmitting={isSubmitting}
          onBucketChange={(v, o) => (setValue(v), setOutcome(o))}
        />
      )}

      <div>
        {outcome === 'CANCEL' ? (
          <>All trades will be returned with no fees.</>
        ) : (
          <>Resolving this market will immediately pay out traders.</>
        )}
      </div>

      <Spacer h={4} />

      {!!error && <div className="text-red-500">{error}</div>}

      <ResolveConfirmationButton
        onResolve={resolve}
        isSubmitting={isSubmitting}
        openModalButtonClass={clsx('w-full mt-2', submitButtonClass)}
        submitButtonClass={submitButtonClass}
      />
    </Col>
  )
}
