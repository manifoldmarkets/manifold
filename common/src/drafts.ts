import { Visibility } from './contract'
import { JSONContent } from '@tiptap/core'
import { Group } from './group'
import { CreateableOutcomeType } from './contract'

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
    savedAt: number
  }
  createdAt: string
}
