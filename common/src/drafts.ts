import { Visibility } from './contract'
import { JSONContent } from '@tiptap/core'
import { Group } from './group'
import { CreateableOutcomeType, PollType } from './contract'

export type MarketDraft = {
  id: number
  data: {
    question: string
    description?: JSONContent
    outcomeType: CreateableOutcomeType
    answers: string[]
    closeDate?: string
    closeHoursMinutes?: string
    visibility: Visibility
    selectedGroups: Group[]
    // MULTI_NUMERIC and DATE market params
    min?: number
    max?: number
    minString?: string
    maxString?: string
    unit?: string
    midpoints?: number[]
    // Mechanism/config flags the create payload reads from form state
    shouldAnswersSumToOne?: boolean
    addAnswersMode?: 'DISABLED' | 'ONLY_CREATOR' | 'ANYONE'
    probability?: number
    neverCloses?: boolean
    liquidityTier?: number
    includeSeeResults?: boolean
    pollType?: PollType
    maxSelections?: number
    savedAt: number
  }
  createdAt: string
}
