import clsx from 'clsx'
import { CreateableOutcomeType, NUMBER_CREATION_ENABLED } from 'common/contract'
import { ReactNode, useState } from 'react'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Spacer } from '../layout/spacer'
import {
  ALL_CONTRACT_TYPES,
  getOutcomeTypeAndSumsToOne,
} from './create-contract-types'
import { CreateContractStateType } from './new-contract-panel'

export function ChoosingContractForm(props: {
  outcomeType: CreateableOutcomeType | undefined
  setOutcomeType: (
    outcomeType: CreateableOutcomeType,
    shouldAnswersSumToOne: boolean
  ) => void
  shouldAnswersSumToOne: boolean | undefined
  setState: (state: CreateContractStateType) => void
}) {
  const { outcomeType, setOutcomeType, shouldAnswersSumToOne, setState } = props

  return (
    <Col>
      <div className="text-lg">Or, create manually from a template:</div>
      <Spacer h={4} />
      <Col className="gap-2">
        {[
          ...Object.values(ALL_CONTRACT_TYPES).filter(({ value }) =>
            NUMBER_CREATION_ENABLED ? true : value !== 'NUMBER'
          ),
        ].map(({ label, name, descriptor, example, value, visual }) => {
          return (
            <OutcomeButton
              key={value + name}
              label={label}
              descriptor={descriptor}
              example={example}
              value={value}
              visual={visual}
              outcomeType={outcomeType}
              shouldAnswersSumToOne={shouldAnswersSumToOne}
              onClick={() => {
                const { outcomeType, shouldSumToOne } =
                  getOutcomeTypeAndSumsToOne(value)
                setOutcomeType(outcomeType, shouldSumToOne)
                setState('filling contract params')
              }}
            />
          )
        })}
      </Col>
    </Col>
  )
}

function OutcomeButton(props: {
  label: string
  descriptor: string
  example: string | ReactNode
  value:
    | CreateableOutcomeType
    | 'INDEPENDENT_MULTIPLE_CHOICE'
    | 'DEPENDENT_MULTIPLE_CHOICE'
    | 'DATE'
  visual: ReactNode
  className?: string
  backgroundColor?: string
  selectClassName?: string
  outcomeType: CreateableOutcomeType | undefined
  shouldAnswersSumToOne: boolean | undefined
  onClick: () => void
}) {
  const {
    label,
    descriptor,
    example,
    value,
    visual,
    className,
    backgroundColor,
    selectClassName,
    outcomeType,
    shouldAnswersSumToOne,
    onClick,
  } = props
  const [touch, setTouch] = useState(false)
  return (
    <button
      className={clsx(
        'hover:ring-primary-200 cursor-pointer rounded-lg px-4 py-2 text-left transition-all hover:ring-2',
        className,
        outcomeType == value ||
          (outcomeType == 'MULTIPLE_CHOICE' &&
            shouldAnswersSumToOne &&
            value == 'DEPENDENT_MULTIPLE_CHOICE') ||
          (outcomeType == 'MULTIPLE_CHOICE' &&
            !shouldAnswersSumToOne &&
            value == 'INDEPENDENT_MULTIPLE_CHOICE') ||
          touch
          ? selectClassName
            ? selectClassName
            : 'from-primary-100 ring-primary-500 bg-gradient-to-br to-transparent ring-2'
          : backgroundColor ?? 'bg-primary-600/5'
      )}
      onClick={onClick}
      onTouchStart={() => setTouch(true)}
      onTouchEnd={() => setTouch(false)}
    >
      <Row className="grow gap-4">
        {visual}
        <Col className="w-full gap-0.5">
          <div className="font-semibold sm:text-lg">{label}</div>
          <Col className="sm:text-md gap-2 text-sm">
            {(value == 'INDEPENDENT_MULTIPLE_CHOICE' ||
              value == 'DEPENDENT_MULTIPLE_CHOICE') && (
              <span className=" mt-0.5">{descriptor}</span>
            )}
            <span className="text-ink-700 italic">{example}</span>
          </Col>
        </Col>
      </Row>
    </button>
  )
}
