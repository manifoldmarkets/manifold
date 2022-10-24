import clsx from 'clsx'
import React, { useState } from 'react'

import { Col } from './layout/col'
import { User } from 'web/lib/firebase/users'
import { NumberCancelSelector } from './bet/yes-no-selector'
import { Spacer } from './layout/spacer'
import { ResolveConfirmationButton } from './buttons/confirmation-button'
import { NumericContract, PseudoNumericContract } from 'common/contract'
import { APIError, resolveMarket } from 'web/lib/firebase/api'
import { BucketInput } from './widgets/bucket-input'
import { getPseudoProbability } from 'common/pseudo-numeric'
import { BETTOR, BETTORS, PAST_BETS } from 'common/user'

export function NumericResolutionPanel(props: {
  isAdmin: boolean
  isCreator: boolean
  creator: User
  contract: NumericContract | PseudoNumericContract
  className?: string
}) {
  const { contract, className, isAdmin, isCreator } = props
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

  return (
    <Col
      className={clsx(
        'relative w-full rounded-md bg-white px-8 py-6',
        className
      )}
    >
      {isAdmin && !isCreator && (
        <span className="bg-scarlet-50 text-scarlet-500 absolute right-4 top-4 rounded p-1 text-xs">
          ADMIN
        </span>
      )}
      <div className="whitespace-nowrap text-2xl">Resolve market</div>

      <div className="my-3 text-sm text-gray-500">Outcome</div>

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
          <>
            All {PAST_BETS} will be returned. Unique {BETTOR} bonuses will be
            withdrawn from your account
          </>
        ) : (
          <>Resolving this market will immediately pay out {BETTORS}.</>
        )}
      </div>

      <Spacer h={4} />

      {!!error && <div className="text-scarlet-500">{error}</div>}

      <ResolveConfirmationButton
        onResolve={resolve}
        isSubmitting={isSubmitting}
        openModalButtonClass={clsx('w-full mt-2')}
        color={outcomeMode === 'CANCEL' ? 'yellow' : 'indigo'}
        disabled={outcomeMode === undefined}
      />
    </Col>
  )
}
