import clsx from 'clsx'
import { CreateableOutcomeType } from 'common/contract'
import { ReactNode, useState } from 'react'
import { Col } from '../../layout/col'
import { Row } from '../../layout/row'
import { PREDICTIVE_CONTRACT_TYPES } from './create-contract-types'
import { CreateContractStateType } from 'web/components/new-contract/new-contract-panel'
import { MINIMUM_BOUNTY, getAnte } from 'common/economy'
import { formatMoney } from 'common/util/format'

export function ChoosingContractForm(props: {
  outcomeType: CreateableOutcomeType | undefined
  setOutcomeType: (outcomeType: CreateableOutcomeType) => void
  setState: (state: CreateContractStateType) => void
}) {
  const { outcomeType, setOutcomeType, setState } = props
  return (
    <Col>
      {/* <div className="text-lg">
        Create a market and ask a question! (optional)
      </div> */}
      {/* <Spacer h={4} /> */}
      <Col className="gap-2">
        {Object.entries(PREDICTIVE_CONTRACT_TYPES).map(
          ([_, { label, descriptor, example, value, visual }]) => (
            <OutcomeButton
              key={value}
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
    </Col>
  )
}

function OutcomeButton(props: {
  label: string
  descriptor: string
  example: string | ReactNode
  value: CreateableOutcomeType
  visual: ReactNode
  className?: string
  backgroundColor?: string
  selectClassName?: string
  outcomeType: CreateableOutcomeType | undefined
  setOutcomeType: (outcomeType: CreateableOutcomeType) => void
  setState: (state: CreateContractStateType) => void
}) {
  const {
    label,
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
  return (
    <button
      className={clsx(
        'hover:ring-primary-200 cursor-pointer rounded-lg px-4 py-2 text-left transition-all hover:ring-2',
        className,
        outcomeType == value || touch
          ? selectClassName
            ? selectClassName
            : 'from-primary-100 ring-primary-500 bg-gradient-to-br to-transparent ring-2'
          : backgroundColor ?? 'bg-primary-600/5'
      )}
      onClick={() => {
        setOutcomeType(value)
        setState('filling contract params')
      }}
      onTouchStart={() => setTouch(true)}
      onTouchEnd={() => setTouch(false)}
    >
      <Row className="grow gap-4">
        {visual}
        <Col className="w-full">
          <Row className="w-full justify-between">
            <div className="font-semibold sm:text-lg">{label}</div>
            <AntePrice outcome={value} />
          </Row>
          <Col className="sm:text-md text-sm">
            <span className="text-ink-700 mt-0.5 italic">{example}</span>
          </Col>
        </Col>
      </Row>
    </button>
  )
}

function AntePrice(props: { outcome: CreateableOutcomeType }) {
  const { outcome } = props
  const ante = formatMoney(getAnte(outcome, 1))
  if (outcome === 'BOUNTIED_QUESTION') {
    return (
      <div className="text-ink-500 text-xs">
        {formatMoney(MINIMUM_BOUNTY)} minimum
      </div>
    )
  }
  if (outcome == 'MULTIPLE_CHOICE') {
    return <div className="text-ink-500 text-xs">{ante} / college</div>
  }
  return <div className="text-ink-500 text-xs">{ante}</div>
}
