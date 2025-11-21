import { useState } from 'react'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { CreateableOutcomeType } from 'common/contract'
import {
  ALL_CONTRACT_TYPES,
  getOutcomeTypeAndSumsToOne,
} from './create-contract-types'
import clsx from 'clsx'
import { Button } from 'web/components/buttons/button'

export function TypeSwitcherModal(props: {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
  currentType: CreateableOutcomeType | 'DISCUSSION_POST'
  currentShouldAnswersSumToOne?: boolean
  onSelectType: (type: CreateableOutcomeType | 'DISCUSSION_POST', shouldSumToOne: boolean) => void
}) {
  const {
    isOpen,
    setIsOpen,
    currentType,
    currentShouldAnswersSumToOne,
    onSelectType,
  } = props
  const [selectedValue, setSelectedValue] = useState<
    keyof typeof ALL_CONTRACT_TYPES | null
  >(null)

  const handleSelect = () => {
    if (selectedValue) {
      const { outcomeType, shouldSumToOne } =
        getOutcomeTypeAndSumsToOne(selectedValue)
      onSelectType(outcomeType, shouldSumToOne)
      setIsOpen(false)
    }
  }

  // Determine current value key
  const getCurrentValueKey = () => {
    if (currentType === 'MULTIPLE_CHOICE') {
      return currentShouldAnswersSumToOne
        ? 'DEPENDENT_MULTIPLE_CHOICE'
        : 'INDEPENDENT_MULTIPLE_CHOICE'
    }
    return currentType
  }

  const currentValueKey = getCurrentValueKey()

  return (
    <Modal open={isOpen} setOpen={setIsOpen} size="lg">
      <Col className="bg-canvas-0 gap-4 rounded-lg p-6">
        <h2 className="text-ink-1000 text-2xl font-semibold">
          Choose Question Type
        </h2>
        <p className="text-ink-600 text-sm">
          Select the type of market you want to create. This determines how
          answers work and how the market resolves.
        </p>

        <Col className="gap-2">
          {Object.entries(ALL_CONTRACT_TYPES).map(([key, type]) => {
            const value = key as keyof typeof ALL_CONTRACT_TYPES
            const isSelected =
              selectedValue === value ||
              (selectedValue === null && currentValueKey === value)
            const isCurrent = currentValueKey === value

            return (
              <button
                key={key}
                onClick={() => setSelectedValue(value)}
                className={clsx(
                  'hover:ring-primary-200 rounded-lg border-2 p-4 text-left transition-all hover:ring-2',
                  isSelected
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-ink-200 bg-canvas-0',
                  isCurrent && 'ring-primary-300 ring-2'
                )}
              >
                <Row className="gap-4">
                  <div className="flex-shrink-0">{type.visual}</div>
                  <Col className="flex-1 gap-1">
                    <Row className="items-center gap-2">
                      <h3 className="text-ink-900 text-lg font-semibold">
                        {type.label}
                      </h3>
                      {isCurrent && (
                        <span className="bg-primary-100 text-primary-700 rounded px-2 py-0.5 text-xs font-medium">
                          Current
                        </span>
                      )}
                    </Row>
                    <p className="text-ink-600 text-sm">{type.descriptor}</p>
                    <p className="text-ink-500 text-xs italic">
                      {type.example}
                    </p>
                  </Col>
                </Row>
              </button>
            )
          })}
        </Col>

        <Row className="justify-end gap-2">
          <Button color="gray-outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button
            color="indigo"
            onClick={handleSelect}
            disabled={
              selectedValue === null || selectedValue === currentValueKey
            }
          >
            Change Type
          </Button>
        </Row>
      </Col>
    </Modal>
  )
}
