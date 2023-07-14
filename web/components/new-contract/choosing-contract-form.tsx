import { useNewContract } from 'web/hooks/use-new-contract'
import { Col } from '../layout/col'
import { formatMoney } from 'common/util/format'
import { OutcomeType } from 'common/contract'
import { ReactNode } from 'react'
import { Spacer } from '../layout/spacer'
import {
  BsFillCheckCircleFill,
  BsFillXCircleFill,
  BsUiChecks,
} from 'react-icons/bs'
import { TfiWrite } from 'react-icons/tfi'
import { GoNumber } from 'react-icons/go'
import { Row } from '../layout/row'
import clsx from 'clsx'
import { GiReceiveMoney } from 'react-icons/gi'
import { CreateContractStateType } from './new-contract-panel'

export const PREDICTIVE_CONTRACT_TYPES = {
  binary: {
    label: 'Yes/No',
    value: 'BINARY',
    descriptor: 'A yes/no question.',
    example: 'Will my dog throw up today?',
    visual: (
      <Col className="text-primary-400 relative my-auto h-12 w-12">
        <BsFillCheckCircleFill className="h-6 w-6" />
        <BsFillXCircleFill className=" absolute bottom-0 right-0 h-6 w-6" />
      </Col>
    ),
  },
  multiple_choice: {
    label: 'Multiple choice',
    value: 'MULTIPLE_CHOICE',
    descriptor: 'A question with multiple answers that you define.',
    example: 'Which candidate will be elected in 2024?',
    visual: (
      <Col className="text-primary-400 relative my-auto h-12 w-12">
        <BsUiChecks className="h-12 w-12" />
      </Col>
    ),
  },
  free_response: {
    label: 'Free response',
    value: 'FREE_RESPONSE',
    descriptor: 'A question that anyone can write an answer to.',
    example: 'What will happen to Trump?',
    visual: (
      <Col className="text-primary-400 relative my-auto h-12 w-12">
        <TfiWrite className="h-12 w-12" />
      </Col>
    ),
  },
  numeric: {
    label: 'Numeric',
    value: 'PSEUDO_NUMERIC',
    descriptor: 'A question with a numerical answer.',
    example: 'How much will my coin collection sell for?',
    visual: (
      <Col className="text-primary-400 relative my-auto h-12 w-12">
        <GoNumber className="h-12 w-12" />
      </Col>
    ),
  },
}

export const NON_PREDICTIVE_CONTRACT_TYPES = {
  bountied_question: {
    label: 'Bountied Question',
    value: 'BOUNTIED_QUESTION',
    descriptor: `A question that anyone can answer for a bounty. The bounty you put up can be distributed however you'd like.`,
    example: `I'll give ${formatMoney(
      1000
    )} to whoever draws the best portrait of my cat?`,
    visual: (
      <Col className="relative my-auto h-12 w-12 text-teal-400">
        <GiReceiveMoney className="h-12 w-12" />
      </Col>
    ),
    selectClass:
      'dark:from-teal-500/20 from-teal-500/30 ring-teal-500 bg-gradient-to-br to-transparent ring-2',
  },
}

export function ChoosingContractForm(props: {
  outcomeType: OutcomeType | undefined
  setOutcomeType: (outcomeType: OutcomeType) => void
  setState: (state: CreateContractStateType) => void
}) {
  const { outcomeType, setOutcomeType, setState } = props

  return (
    <Col>
      <div className="text-lg">What would you like to create?</div>
      <Spacer h={6} />
      <div className="text-primary-400 text-sm font-semibold">
        PREDICTION MARKET
      </div>
      <div className="text-ink-700">
        A question about the future that people can bet on.
      </div>
      <Spacer h={2} />
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
      <hr className="border-ink-300 my-2" />
      <Col className="mb-1 gap-2">
        {Object.entries(NON_PREDICTIVE_CONTRACT_TYPES).map(
          ([
            key,
            { label, descriptor, example, value, visual, selectClass },
          ]) => (
            <OutcomeButton
              label={label}
              descriptor={descriptor}
              example={example}
              value={value}
              selectClass={selectClass}
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
  selectClass?: string
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
    selectClass,
    outcomeType,
    setOutcomeType,
    setState,
  } = props
  return (
    <button
      className={clsx(
        'cursor-pointer rounded-lg py-2 px-4 text-left',
        outcomeType == value
          ? selectClass
            ? selectClass
            : 'from-primary-100 ring-primary-500 bg-gradient-to-br to-transparent ring-2'
          : ''
      )}
      onClick={() => {
        setOutcomeType(value as OutcomeType)
        setState('filling contract params')
      }}
    >
      <Row className="gap-4">
        {visual}
        <Col>
          <div className="font-semibold sm:text-lg">{label}</div>
          <Col className="sm:text-md text-sm">
            <div className={'text-ink-700'}>{descriptor}</div>
            <span className="text-ink-700 mt-0.5 italic">{example}</span>
          </Col>
        </Col>
      </Row>
    </button>
  )
}
