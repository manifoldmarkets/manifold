import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { CreateableOutcomeType } from 'common/contract'
import {
  ALL_CONTRACT_TYPES,
  getOutcomeTypeAndSumsToOne,
} from './create-contract-types'
import clsx from 'clsx'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/solid'

export function ProminentTypeSelector(props: {
  currentType: CreateableOutcomeType | null
  currentShouldAnswersSumToOne?: boolean
  onSelectType: (type: CreateableOutcomeType, shouldSumToOne: boolean) => void
}) {
  const { currentType, currentShouldAnswersSumToOne, onSelectType } = props
  const [isExpanded, setIsExpanded] = useState(!currentType) // Start expanded if no type selected

  // Primary types to always show
  const PRIMARY_TYPES = ['BINARY', 'DEPENDENT_MULTIPLE_CHOICE'] as const

  // Determine current value key
  const getCurrentValueKey = () => {
    if (!currentType) return null
    if (currentType === 'MULTIPLE_CHOICE') {
      return currentShouldAnswersSumToOne
        ? 'DEPENDENT_MULTIPLE_CHOICE'
        : 'INDEPENDENT_MULTIPLE_CHOICE'
    }
    return currentType
  }

  const currentValueKey = getCurrentValueKey()
  const currentTypeInfo = currentValueKey
    ? ALL_CONTRACT_TYPES[currentValueKey as keyof typeof ALL_CONTRACT_TYPES]
    : null

  const handleSelect = (key: keyof typeof ALL_CONTRACT_TYPES) => {
    const { outcomeType, shouldSumToOne } = getOutcomeTypeAndSumsToOne(key)
    onSelectType(outcomeType, shouldSumToOne)
    setIsExpanded(false) // Collapse after selection
  }

  if (!isExpanded && currentTypeInfo) {
    // Compact mode - show small selector at top
    const isCurrentTypePrimary = PRIMARY_TYPES.includes(currentValueKey as any)
    const primaryTypes = Object.entries(ALL_CONTRACT_TYPES).filter(([key]) =>
      PRIMARY_TYPES.includes(key as any)
    )

    return (
      <div className="bg-canvas-0 border-ink-200 border-b">
        <Row className="mx-auto w-full max-w-3xl items-center gap-2 p-2 sm:p-3">
          {/* Always show the two primary types */}
          {primaryTypes.map(([key, type]) => {
            const isSelected = currentValueKey === key
            return (
              <button
                key={key}
                onClick={() => {
                  if (isSelected) {
                    // Clicking selected type - expand showing all types
                    setIsExpanded(true)
                  } else {
                    handleSelect(key as keyof typeof ALL_CONTRACT_TYPES)
                  }
                }}
                className={clsx(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 px-2 py-1.5 transition-colors sm:gap-2 sm:px-3',
                  isSelected
                    ? 'border-primary-300 bg-primary-50'
                    : 'border-ink-200 bg-canvas-0 hover:border-ink-300'
                )}
              >
                <div
                  className={clsx(
                    'scale-75 sm:scale-100',
                    isSelected ? 'text-primary-600' : 'text-ink-400'
                  )}
                >
                  {type.visual}
                </div>
                <span
                  className={clsx(
                    'hidden text-xs font-semibold sm:inline sm:text-sm',
                    isSelected ? 'text-ink-900' : 'text-ink-600'
                  )}
                >
                  {type.label}
                </span>
                <ChevronDownIcon
                  className={clsx(
                    'text-ink-400 hidden h-3 w-3 sm:block sm:h-4 sm:w-4',
                    isSelected ? 'sm:opacity-100' : 'sm:opacity-0'
                  )}
                />
              </button>
            )
          })}

          {/* Third slot: Show selected non-primary type OR "More" button */}
          {!isCurrentTypePrimary ? (
            <button
              onClick={() => {
                // Clicking selected non-primary type - expand showing all types
                setIsExpanded(true)
              }}
              className={clsx(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 px-2 py-1.5 transition-colors sm:gap-2 sm:px-3',
                'border-primary-300 bg-primary-50'
              )}
            >
              <div className="text-primary-600 scale-75 sm:scale-100">
                {currentTypeInfo.visual}
              </div>
              <span className="text-ink-900 hidden text-xs font-semibold sm:inline sm:text-sm">
                {currentTypeInfo.label}
              </span>
              <ChevronDownIcon className="text-ink-400 hidden h-3 w-3 sm:inline sm:h-4 sm:w-4" />
            </button>
          ) : (
            <button
              onClick={() => {
                // Clicking More - expand showing all types
                setIsExpanded(true)
              }}
              className="border-ink-200 bg-canvas-0 hover:border-ink-300 flex flex-1 items-center justify-center gap-0.5 rounded-lg border-2 px-2 py-1.5 transition-colors sm:gap-1 sm:px-3"
            >
              {/* Show mini icons of other types */}
              <div className="flex scale-75 items-center -space-x-1 sm:scale-100">
                {Object.entries(ALL_CONTRACT_TYPES)
                  .filter(([key]) => !PRIMARY_TYPES.includes(key as any))
                  .slice(0, 3)
                  .map(([key, type]) => (
                    <div key={key} className="text-ink-400">
                      {type.visual}
                    </div>
                  ))}
              </div>
              <span className="text-ink-600 hidden text-xs font-semibold sm:inline sm:text-sm">
                More
              </span>
            </button>
          )}
        </Row>
      </div>
    )
  }

  // Expanded mode - show all types prominently
  return (
    <div className="from-primary-50 to-canvas-0 border-ink-200 border-b bg-gradient-to-b p-4 sm:p-6">
      <Col className="mx-auto w-full max-w-5xl gap-4">
        <Row className="items-center justify-between">
          <h2 className="text-ink-900 text-lg font-bold sm:text-2xl">
            Choose Your Question Type
          </h2>
          {currentType && (
            <button
              onClick={() => setIsExpanded(false)}
              className="text-ink-600 hover:text-ink-800 flex items-center gap-1 text-sm"
            >
              <ChevronUpIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Collapse</span>
            </button>
          )}
        </Row>

        {/* Always show all types */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(ALL_CONTRACT_TYPES).map(([key, type]) => {
            const isSelected = currentValueKey === key

            return (
              <button
                key={key}
                onClick={() =>
                  handleSelect(key as keyof typeof ALL_CONTRACT_TYPES)
                }
                className={clsx(
                  'group relative flex flex-col gap-2 rounded-xl border-2 p-4 text-left transition-all sm:gap-3 sm:p-5',
                  'hover:shadow-lg active:scale-[0.98] sm:hover:scale-[1.02]',
                  isSelected
                    ? 'border-primary-500 bg-primary-50 shadow-md'
                    : 'border-ink-200 bg-canvas-0 hover:border-primary-300'
                )}
              >
                {isSelected && (
                  <div className="bg-primary-500 absolute right-2 top-2 rounded-full px-2 py-0.5 text-xs font-semibold text-white sm:right-3 sm:top-3">
                    Selected
                  </div>
                )}

                <Row className="items-center gap-2 sm:gap-3">
                  <div
                    className={clsx(
                      'text-3xl transition-transform group-hover:scale-110 sm:text-4xl',
                      isSelected
                        ? 'text-primary-600'
                        : 'text-ink-400 group-hover:text-primary-500'
                    )}
                  >
                    {type.visual}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-ink-900 text-base font-bold sm:text-lg">
                      {type.label}
                    </h3>
                  </div>
                </Row>

                <p className="text-ink-600 text-xs leading-relaxed sm:text-sm">
                  {type.descriptor}
                </p>

                <p className="text-ink-500 border-ink-200 border-t pt-2 text-xs italic">
                  Example: {type.example}
                </p>
              </button>
            )
          })}
        </div>
      </Col>
    </div>
  )
}
