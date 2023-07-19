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
import { capitalize } from 'lodash'

export type NewQuestionParams = {
  groupId?: string
  q: string
  description: string
  closeTime: string
  outcomeType?: string
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

  const [privacy, setPrivacy] = useState<VisibilityTheme>(
    params && params.visibility === 'private' ? 'private' : 'non-private'
  )

  return (
    <Col
      className={clsx(
        'text-ink-1000 bg-canvas-0 mx-auto w-full max-w-2xl transition-colors'
      )}
    >
      <CreateStepTracker
        outcomeType={outcomeType}
        setState={setState}
        state={state}
        privacy={privacy}
        fromGroup={fromGroup}
      />
      <Col className={clsx('py-2', fromGroup ? 'px-1' : 'px-6')}>
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
            creator={creator}
            setPrivacy={setPrivacy}
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
  setState: (state: CreateContractStateType) => void
  state: CreateContractStateType
  privacy: VisibilityTheme
  fromGroup?: boolean
}) {
  const { outcomeType, setState, state, privacy, fromGroup } = props
  return (
    <Row
      className={clsx(
        'text-ink-400 bg-canvas-0 border-1 border-ink-200 sticky z-10 w-full items-center gap-1 border-b pt-4 pb-2',
        fromGroup ? '-px-1 top-4' : 'top-0 px-6'
      )}
    >
      <CreateStepButton
        className={clsx('text-primary-500')}
        selected={state == 'choosing contract'}
        onClick={() => setState('choosing contract')}
      >
        Choose question type
      </CreateStepButton>
      <ChevronRightIcon className={clsx('h-5 w-5')} />
      <CreateStepButton
        disabled={!outcomeType}
        selected={state == 'filling contract params'}
        onClick={() => {
          if (outcomeType) {
            setState('filling contract params')
          }
        }}
      >
        {outcomeType
          ? `${privacy == 'private' ? 'private' : ''} ${capitalize(
              getContractTypeThingFromValue('name', outcomeType)
            )}`
          : ''}
      </CreateStepButton>
    </Row>
  )
}

function CreateStepButton(props: {
  onClick: () => void
  className?: string
  children: ReactNode
  selected: boolean
  disabled?: boolean
}) {
  const { onClick, children, className, selected, disabled } = props
  return (
    <button
      className={clsx(
        className,
        'disabled:text-ink-400 transition-all disabled:cursor-not-allowed',
        selected ? 'text-primary-500 font-semibold' : '',
        disabled ? '' : 'hover:text-indigo-400 dark:hover:text-indigo-300'
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}
