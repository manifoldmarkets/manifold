import { CreateableOutcomeType, add_answers_mode } from 'common/contract'

// Type definitions for URL params and contract creation
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
  // Starting probability of each answer, in percent, in the same order as
  // `answers`. Duplicating a cpmm-multi-2 market carries its current odds.
  answerProbs?: number[]
  precision?: number
  sportsStartTimestamp?: string
  sportsEventId?: string
  sportsLeague?: string
  unit?: string
  midpoints?: number[]
  rand?: string
  overrideKey?: string
}
