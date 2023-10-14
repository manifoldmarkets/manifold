import { useState } from 'react'

import { User } from 'web/lib/firebase/users'
import { NumberCancelSelector } from './bet/yes-no-selector'
import { Spacer } from './layout/spacer'
import { ResolveConfirmationButton } from './buttons/confirmation-button'
import { PseudoNumericContract } from 'common/contract'
import { APIError, resolveMarket } from 'web/lib/firebase/api'
import { getPseudoProbability } from 'common/pseudo-numeric'
import { BETTORS } from 'common/user'
import { Button } from './buttons/button'
import { AmountInput } from './widgets/amount-input'

function getNumericResolveButtonColor(
  outcomeMode: 'NUMBER' | 'CANCEL' | undefined
) {
  return outcomeMode === 'CANCEL' ? 'yellow' : 'indigo'
}

function getNumericResolveButtonLabel(
  outcomeMode: 'NUMBER' | 'CANCEL' | undefined,
  value: number | undefined
) {
  return outcomeMode === 'CANCEL' ? 'N/A' : value ? String(value) : ''
}

export function NumericResolutionPanel(props: {
  isCreator: boolean
  creator: User
  contract: PseudoNumericContract
  modalSetOpen?: (open: boolean) => void
}) {
  const { contract, isCreator, modalSetOpen } = props
  const { min, max, outcomeType, question } = contract

  const [outcomeMode, setOutcomeMode] = useState<'NUMBER' | 'CANCEL'>('NUMBER')
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
      await resolveMarket({
        outcome: finalOutcome,
        value,
        probabilityInt,
        contractId: contract.id,
      })
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
      {!isCreator && (
        <span className="bg-scarlet-500/20 text-scarlet-500 absolute right-4 top-4 rounded p-1 text-xs">
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

      <NumberCancelSelector selected={outcomeMode} onSelect={setOutcomeMode} />

      <Spacer h={4} />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          {
            outcomeMode === 'CANCEL' ? (
              <>Cancel all trades and return mana back to {BETTORS}.</>
            ) : outcomeMode === 'NUMBER' ? (
              <>
                Pay out {BETTORS} who brought the market closer to the correct
                value.
                <AmountInput
                  amount={value}
                  onChangeAmount={setValue}
                  disabled={isSubmitting}
                  error={value !== undefined && (value < min || value > max)}
                  allowNegative
                  label=""
                  inputClassName="!h-11 w-28"
                />
              </>
            ) : null // never
          }
        </div>

        {!modalSetOpen && (
          <ResolveConfirmationButton
            onResolve={resolve}
            isSubmitting={isSubmitting}
            color={getNumericResolveButtonColor(outcomeMode)}
            label={getNumericResolveButtonLabel(outcomeMode, value)}
            marketTitle={question}
            disabled={buttonDisabled}
          />
        )}
        {modalSetOpen && (
          <Button
            color={getNumericResolveButtonColor(outcomeMode)}
            disabled={buttonDisabled || isSubmitting}
            loading={isSubmitting}
            onClick={resolve}
          >
            Resolve <>{getNumericResolveButtonLabel(outcomeMode, value)}</>
          </Button>
        )}
      </div>
      {!!error && <div className="text-scarlet-500">{error}</div>}
    </>
  )
}
