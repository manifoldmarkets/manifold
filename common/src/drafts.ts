import { Visibility } from './contract'
import { JSONContent } from '@tiptap/core'
import { Group } from './group'
import { CreateableOutcomeType } from './contract'
import { MarketLinkRelation } from './market-links'

export type MarketDraft = {
  id: number
  data: {
    question: string
    description?: JSONContent
    outcomeType: CreateableOutcomeType
    answers: string[]
    closeDate?: string
    closeHoursMinutes?: string
    neverCloses?: boolean
    hasManuallyEditedCloseDate?: boolean
    inheritedCloseTimeFrom?: string
    linkedToContractId?: string
    linkRelation?: MarketLinkRelation
    visibility: Visibility
    selectedGroups: Group[]
    savedAt: number
  }
  createdAt: string
}
