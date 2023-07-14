import clsx from 'clsx'
import { ReactNode, useState } from 'react'

import { User } from 'common/user'

import { ChevronRightIcon } from '@heroicons/react/solid'
import { OutcomeType } from 'common/contract'
import { VisibilityTheme } from 'web/pages/create'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { ChoosingContractForm } from './choosing-contract-form'
import { ContractParamsForm } from './contract-params-form'
import { getContractTypeThingFromValue } from './create-contract-types'

export type NewQuestionParams = {
  groupId?: string
  q: string
  type: string
  description: string
  closeTime: string
  outcomeType: string
  visibility: string
  // Params for PSEUDO_NUMERIC outcomeType
  min?: string
  max?: string
  isLogScale?: string
  initValue?: string

  // Answers encoded as:
  // a0: string
  // a1: string
  // ...etc
}

export type ContractVisibilityType = 'public' | 'unlisted'
export type CreateContractStateType =
  | 'choosing contract'
  | 'filling contract params'

// Allow user to create a new contract
export function NewContractPanel(props: {
  creator: User
  params?: NewQuestionParams
  fromGroup?: boolean
  className?: string
}) {
  const { creator, params, fromGroup, className } = props
  const [outcomeType, setOutcomeType] = useState<OutcomeType | undefined>(
    (params?.outcomeType as OutcomeType) ?? undefined
  )

  const [state, setState] = useState<CreateContractStateType>(
    params?.outcomeType ? 'filling contract params' : 'choosing contract'
  )

  const [theme, setTheme] = useState<VisibilityTheme>('non-private')

  return (
    <Col
      className={clsx(
        className,
        'text-ink-1000 mx-auto w-full max-w-2xl transition-colors ',
        theme == 'private' ? ' bg-primary-100' : 'bg-canvas-0'
      )}
    >
      <CreateStepTracker
        outcomeType={outcomeType}
        theme={theme}
        setState={setState}
        state={state}
      />
      <Col className="py-2 px-6">
        {state == 'choosing contract' && (
          <ChoosingContractForm
            outcomeType={outcomeType}
            setOutcomeType={setOutcomeType}
            setState={setState}
          />
        )}
        {state == 'filling contract params' && outcomeType && (
          <ContractParamsForm
            outcomeType={outcomeType}
            setOutcomeType={setOutcomeType}
            setState={setState}
            creator={creator}
            setTheme={setTheme}
            fromGroup={fromGroup}
            params={params}
          />
        )}
      </Col>
    </Col>
  )
}

function CreateStepTracker(props: {
  outcomeType: OutcomeType | undefined
  theme: VisibilityTheme
  setState: (state: CreateContractStateType) => void
  state: CreateContractStateType
}) {
  const { outcomeType, theme, setState, state } = props
  return (
    <Row className="text-ink-400 bg-canvas-0 sticky top-0 z-10 w-full items-center gap-1 px-6 py-2">
      <CreateStepButton
        className={'text-primary-500'}
        onClick={() => setState('choosing contract')}
      >
        Choose
      </CreateStepButton>
      <ChevronRightIcon className={clsx('h-5 w-5')} />
      <CreateStepButton
        className={
          state == 'filling contract params'
            ? 'text-primary-500'
            : 'text-ink-400'
        }
        onClick={() => {
          if (outcomeType) {
            setState('filling contract params')
          }
        }}
      >
        Create
        {outcomeType
          ? ` a ${
              theme == 'private' ? 'private' : ''
            } ${getContractTypeThingFromValue('name', outcomeType)}`
          : ''}
      </CreateStepButton>
    </Row>
  )
}

function CreateStepButton(props: {
  onClick: () => void
  className: string
  children: ReactNode
  disabled?: boolean
}) {
  const { onClick, children, className, disabled } = props
  return (
    <button
      className={clsx(className, 'transition-all disabled:cursor-not-allowed')}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}
