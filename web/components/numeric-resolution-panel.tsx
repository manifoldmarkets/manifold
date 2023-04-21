import React, { useState } from 'react'

import { User } from 'web/lib/firebase/users'
import { NumberCancelSelector } from './bet/yes-no-selector'
import { Spacer } from './layout/spacer'
import { ResolveConfirmationButton } from './buttons/confirmation-button'
import { NumericContract, PseudoNumericContract } from 'common/contract'
import { APIError, resolveMarket } from 'web/lib/firebase/api'
import { BucketInput } from './widgets/bucket-input'
import { getPseudoProbability } from 'common/pseudo-numeric'
import { BETTORS } from 'common/user'
import { GradientContainer } from './widgets/gradient-container'
import { Button } from './buttons/button'

export function NumericResolutionPanel(props: {
  isAdmin: boolean
  isCreator: boolean
  creator: User
  contract: NumericContract | PseudoNumericContract
  className?: string
  modalSetOpen?: (open: boolean) => void
}) {
  const { contract, className, isAdmin, isCreator, modalSetOpen } = props
  const { min, max, outcomeType, question } = contract

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
    if (modalSetOpen) {
      modalSetOpen(false)
    }
  }
  const buttonDisabled =
    outcomeMode === undefined ||
    (value === undefined && outcomeMode !== 'CANCEL')

  return (
    <>
      {isAdmin && !isCreator && (
        <span className="bg-scarlet-500/20 text-scarlet-500 absolute right-4 top-4 rounded p-1 text-xs">
          ADMIN
        </span>
      )}
      {!modalSetOpen && <div className="mb-6">Resolve your market</div>}
      {modalSetOpen && (
        <div className="mb-6">Resolve "{contract.question}"</div>
      )}

      <NumberCancelSelector selected={outcomeMode} onSelect={setOutcomeMode} />

      <Spacer h={4} />

      {outcomeMode === 'NUMBER' && (
        <BucketInput
          contract={contract}
          isSubmitting={isSubmitting}
          onBucketChange={(v, o) => (setValue(v), setOutcome(o))}
        />
      )}

      <div className="flex items-center justify-between">
        <div className="text-sm">
          {outcomeMode === 'CANCEL' ? (
            <>Cancel all trades and return money back to {BETTORS}.</>
          ) : (
            <>Resolving this market will immediately pay out {BETTORS}.</>
          )}
        </div>

        {!modalSetOpen && (
          <ResolveConfirmationButton
            onResolve={resolve}
            isSubmitting={isSubmitting}
            color={outcomeMode === 'CANCEL' ? 'yellow' : 'indigo'}
            label={outcomeMode === 'CANCEL' ? 'N/A' : String(value)}
            marketTitle={question}
            disabled={buttonDisabled}
          />
        )}
        {modalSetOpen && (
          <Button
            color={outcomeMode === 'CANCEL' ? 'yellow' : 'indigo'}
            disabled={buttonDisabled || isSubmitting}
            loading={isSubmitting}
            onClick={resolve}
          >
            Resolve{' '}
            {outcomeMode === 'CANCEL' ? (
              <>N/A</>
            ) : !value ? (
              <></>
            ) : (
              String(value)
            )}
          </Button>
        )}
      </div>
      {!!error && <div className="text-scarlet-500">{error}</div>}
    </>
  )
}
