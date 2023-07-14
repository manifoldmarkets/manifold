import clsx from 'clsx'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'

import { User } from 'common/user'

import { useNewContract } from 'web/hooks/use-new-contract'
import { VisibilityTheme } from 'web/pages/create'
import { Col } from '../layout/col'
import { ContractParamsForm } from './contract-params-form'
import { ChoosingContractForm } from './choosing-contract-form'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { OutcomeType } from 'common/contract'

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
  setTheme: (theme: VisibilityTheme) => void
}) {
  const { creator, params, fromGroup, className, setTheme } = props
  const [outcomeType, setOutcomeType] = useState<OutcomeType | undefined>(
    (params?.outcomeType as OutcomeType) ?? undefined
  )

  const [state, setState] = useState<CreateContractStateType>(
    params?.outcomeType ? 'filling contract params' : 'choosing contract'
  )

  return (
    <Col className={clsx(className, 'text-ink-1000')}>
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
  )
}
