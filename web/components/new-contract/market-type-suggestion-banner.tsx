import { XIcon } from '@heroicons/react/solid'
import { CreateableOutcomeType } from 'common/contract'
import { useState } from 'react'
import { Row } from '../layout/row'
import { ALL_CONTRACT_TYPES } from './create-contract-types'
import { MarketTypeSuggestion } from './market-type-suggestions'
import clsx from 'clsx'

export function MarketTypeSuggestionBanner(props: {
  suggestion: MarketTypeSuggestion
  onSwitchType: (
    type: CreateableOutcomeType,
    shouldSumToOne?: boolean,
    addAnswersMode?: 'DISABLED' | 'ONLY_CREATOR' | 'ANYONE',
    removeOtherAnswer?: boolean
  ) => void
  onDismiss: () => void
}) {
  const { suggestion, onSwitchType, onDismiss } = props
  const [isDismissed, setIsDismissed] = useState(false)

  if (isDismissed) return null

  const suggestedTypeKey =
    suggestion.suggestedType === 'MULTIPLE_CHOICE'
      ? suggestion.suggestedShouldSumToOne === false
        ? 'INDEPENDENT_MULTIPLE_CHOICE'
        : 'DEPENDENT_MULTIPLE_CHOICE'
      : suggestion.suggestedType

  const suggestedTypeInfo =
    ALL_CONTRACT_TYPES[suggestedTypeKey as keyof typeof ALL_CONTRACT_TYPES]

  const handleDismiss = () => {
    setIsDismissed(true)
    onDismiss()
  }

  const handleSwitch = () => {
    onSwitchType(
      suggestion.suggestedType,
      suggestion.suggestedShouldSumToOne,
      suggestion.suggestedAddAnswersMode,
      suggestion.removeOtherAnswer
    )
  }

  return (
    <div
      className={clsx(
        'relative rounded-lg border p-3 text-sm',
        suggestion.confidence === 'high'
          ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950'
          : 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950'
      )}
    >
      <Row className="items-start gap-2">
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="font-semibold">💡 Suggestion:</span>
            {suggestion.confidence === 'high' && (
              <span className="rounded bg-amber-200 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                Strong match
              </span>
            )}
          </div>
          <p className="mb-2">
            {suggestion.removeOtherAnswer ? (
              <>
                You have an "Other" answer.{' '}
                <button
                  onClick={handleSwitch}
                  className="font-semibold underline hover:no-underline"
                >
                  Enable adding answers later
                </button>
                , which adds a built-in "other" answer. Traders can then buy and
                sell shares in the "Other" option and keep those shares across
                any answers added later.
              </>
            ) : (
              <>
                {suggestion.reason}. Would you like to create a{' '}
                <button
                  onClick={handleSwitch}
                  className="font-semibold underline hover:no-underline"
                >
                  {suggestedTypeInfo?.label} market
                </button>{' '}
                instead?
              </>
            )}
          </p>
          {suggestedTypeInfo && !suggestion.removeOtherAnswer && (
            <p className="text-ink-600 text-xs italic">
              Example: {suggestedTypeInfo.example}
            </p>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className="hover:bg-ink-100 -mr-1 -mt-1 rounded p-1 transition-colors"
          aria-label="Dismiss suggestion"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </Row>
    </div>
  )
}
