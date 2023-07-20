import { OutcomeType } from 'common/contract'

export type NewQuestionParams = {
  groupIds?: string[]
  q: string
  description: string
  closeTime: number
  outcomeType?: OutcomeType
  visibility: string
  // Params for PSEUDO_NUMERIC outcomeType
  min?: number
  max?: number
  isLogScale?: boolean
  initValue?: number
  answers?: string[]
}

export type ContractVisibilityType = 'public' | 'unlisted'
