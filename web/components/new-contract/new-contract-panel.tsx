import clsx from 'clsx'
import { ReactNode, useState } from 'react'
import { ChevronRightIcon } from '@heroicons/react/solid'
import { User } from 'common/user'
import { CreateableOutcomeType, add_answers_mode } from 'common/contract'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { ChoosingContractForm } from './choosing-contract-form'
import { ContractParamsForm } from './contract-params-form'
import { getContractTypeThingFromValue } from './create-contract-types'
import { capitalize } from 'lodash'

export type NewQuestionParams = {
  groupIds?: string[]
  groupSlugs?: string[]
  q: string
  description: string
  closeTime: number
  outcomeType?: CreateableOutcomeType
  visibility: string
  // Params for PSEUDO_NUMERIC outcomeType
  min?: number
  max?: number
  isLogScale?: boolean
  initValue?: number
  answers?: string[]
  addAnswersMode?: add_answers_mode
  shouldAnswersSumToOne?: boolean
}

export type ContractVisibilityType = 'public' | 'unlisted'
export type CreateContractStateType =
  | 'choosing contract'
  | 'filling contract params'

// Allow user to create a new contract
export function NewContractPanel(props: {
  creator: User
  params?: NewQuestionParams
}) {
  const { creator, params } = props
  const [outcomeType, setOutcomeType] = useState<
    CreateableOutcomeType | undefined
  >(params?.outcomeType ?? undefined)

  const [state, setState] = useState<CreateContractStateType>(
    params?.outcomeType ? 'filling contract params' : 'choosing contract'
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
        privacy={'non-private'}
      />
      <Col className={clsx('px-6 py-2')}>
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
            params={params}
          />
        )}
      </Col>
    </Col>
  )
}

function CreateStepTracker(props: {
  outcomeType: CreateableOutcomeType | undefined
  setState: (state: CreateContractStateType) => void
  privacy: 'non-private' | 'private'
}) {
  const { outcomeType, setState, privacy } = props
  return (
    <Row
      className={clsx(
        'text-ink-400 bg-canvas-0 border-1 border-ink-200 sticky z-10 w-full items-center gap-1 border-b pb-2 pt-4',
        'top-0 px-6'
      )}
    >
      <CreateStepButton onClick={() => setState('choosing contract')}>
        Choose question type
      </CreateStepButton>
      <ChevronRightIcon className={clsx('h-5 w-5')} />
      <CreateStepButton
        disabled={!outcomeType}
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
  disabled?: boolean
}) {
  const { onClick, children, className, disabled } = props
  return (
    <button
      className={clsx(
        className,
        'disabled:text-ink-400 text-primary-600 enabled:hover:text-primary-800 transition-all  disabled:cursor-not-allowed'
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}
