import { OutcomeType } from 'common/contract'

export type NewQuestionParams = {
  groupId?: string
  q: string
  description: string
  closeTime: string
  outcomeType?: OutcomeType
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
