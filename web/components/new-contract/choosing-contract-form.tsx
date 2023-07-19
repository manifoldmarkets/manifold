import clsx from 'clsx'
import { OutcomeType } from 'common/contract'
import { POLLS_ENABLED } from 'common/envs/constants'
import { ReactNode, useState } from 'react'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Spacer } from '../layout/spacer'
import {
  NON_PREDICTIVE_CONTRACT_TYPES,
  PREDICTIVE_CONTRACT_TYPES,
} from './create-contract-types'
import { CreateContractStateType } from './new-contract-panel'

export function ChoosingContractForm(props: {
  outcomeType: OutcomeType | undefined
  setOutcomeType: (outcomeType: OutcomeType) => void
  setState: (state: CreateContractStateType) => void
}) {
  const { outcomeType, setOutcomeType, setState } = props
  return (
    <Col>
      <div className="text-lg">Choose your question type.</div>
      <Spacer h={4} />
      <Col className="gap-2">
        {Object.entries(PREDICTIVE_CONTRACT_TYPES).map(
          ([key, { label, descriptor, example, value, visual }]) => (
            <OutcomeButton
              label={label}
              descriptor={descriptor}
              example={example}
              value={value}
              visual={visual}
              outcomeType={outcomeType}
              setOutcomeType={setOutcomeType}
              setState={setState}
            />
          )
        )}
      </Col>
      <hr className="border-ink-200 my-2" />
      <Col className="mb-1 gap-2">
        {Object.entries(NON_PREDICTIVE_CONTRACT_TYPES).map(
          ([
            key,
            {
              label,
              descriptor,
              example,
              value,
              visual,
              className,
              backgroundColor,
              selectClassName,
            },
          ]) => (
            <OutcomeButton
              label={label}
              descriptor={descriptor}
              example={example}
              value={value}
              className={className}
              backgroundColor={backgroundColor}
              selectClassName={selectClassName}
              outcomeType={outcomeType}
              setOutcomeType={setOutcomeType}
              visual={visual}
              setState={setState}
            />
          )
        )}
      </Col>
    </Col>
  )
}

function OutcomeButton(props: {
  label: string
  descriptor: string
  example: string | ReactNode
  value: string
  visual: ReactNode
  className?: string
  backgroundColor?: string
  selectClassName?: string
  outcomeType: OutcomeType | undefined
  setOutcomeType: (outcomeType: OutcomeType) => void
  setState: (state: CreateContractStateType) => void
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
    setOutcomeType,
    setState,
  } = props
  const [touch, setTouch] = useState(false)
  if (value == 'POLL' && !POLLS_ENABLED) return <></>
  return (
    <button
      className={clsx(
        'hover:ring-primary-200 cursor-pointer rounded-lg py-2 px-4 text-left transition-all hover:ring-2',
        className,
        outcomeType == value || touch
          ? selectClassName
            ? selectClassName
            : 'from-primary-100 ring-primary-500 bg-gradient-to-br to-transparent ring-2'
          : backgroundColor ?? 'bg-primary-600/5'
      )}
      onClick={() => {
        setOutcomeType(value as OutcomeType)
        setState('filling contract params')
      }}
      onTouchStart={() => setTouch(true)}
      onTouchEnd={() => setTouch(false)}
    >
      <Row className="gap-4">
        {visual}
        <Col>
          <div className="font-semibold sm:text-lg">{label}</div>
          <Col className="sm:text-md text-sm">
            <span className="text-ink-700 mt-0.5 italic">{example}</span>
          </Col>
        </Col>
      </Row>
    </button>
  )
}
