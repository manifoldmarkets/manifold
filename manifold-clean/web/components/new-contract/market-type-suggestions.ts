import { CreateableOutcomeType } from 'common/contract'

export type MarketTypeSuggestion = {
  suggestedType: CreateableOutcomeType
  suggestedShouldSumToOne?: boolean
  suggestedAddAnswersMode?: 'DISABLED' | 'ONLY_CREATOR' | 'ANYONE'
  removeOtherAnswer?: boolean
  reason: string
  confidence: 'high' | 'medium' | 'low'
}

/**
 * Analyzes a question and suggests a better market type if applicable
 */
export function suggestMarketType(
  question: string,
  currentType: CreateableOutcomeType,
  answers?: string[],
  addAnswersMode?: 'DISABLED' | 'ONLY_CREATOR' | 'ANYONE',
  shouldAnswersSumToOne?: boolean
): MarketTypeSuggestion | null {
  // "Other" option suggestion for MULTIPLE_CHOICE markets with shouldAnswersSumToOne
  // Check this first, before returning null for empty questions, since it doesn't need a question
  if (
    currentType === 'MULTIPLE_CHOICE' &&
    shouldAnswersSumToOne === true &&
    answers &&
    answers.length > 0 &&
    addAnswersMode === 'DISABLED'
  ) {
    const hasOtherAnswer = answers.some(
      (answer) => answer.toLowerCase().trim() === 'other'
    )

    if (hasOtherAnswer) {
      return {
        suggestedType: 'MULTIPLE_CHOICE',
        suggestedShouldSumToOne: true,
        suggestedAddAnswersMode: 'ONLY_CREATOR',
        removeOtherAnswer: true,
        reason:
          'You have an "Other" answer. Enable adding answers later, which adds a built-in "other" option to markets where only one answer can resolve YES. Traders can then buy and sell shares in the "Other" option, and keep those shares across any answers added later',
        confidence: 'high',
      }
    }
  }

  const lowerQuestion = question.toLowerCase().trim()

  if (!lowerQuestion) return null

  // DATE market suggestions
  const datePatterns = [
    /^when will/,
    /^when does/,
    /^when is/,
    /what date/,
    /which date/,
    /on what date/,
    /^by when/,
    / released from (prison|jail)/,
    / be released$/,
    / release date/,
  ]

  if (
    currentType !== 'DATE' &&
    datePatterns.some((pattern) => pattern.test(lowerQuestion))
  ) {
    return {
      suggestedType: 'DATE',
      reason: 'This question asks about a specific date or time',
      confidence: 'high',
    }
  }

  // MULTI_NUMERIC market suggestions
  const numericPatterns = [
    /^how many/,
    /^how much/,
    /^what will.*be$/,
    /^what will.*price/,
    /^what will.*cost/,
    /^what will.*value/,
    /^what will.*number/,
    /^what will.*score/,
    /^what will.*rating/,
    / how many /,
    / how much /,
    /what.*price$/,
    /what.*temperature$/,
    /what.*percentage$/,
  ]

  if (
    currentType !== 'MULTI_NUMERIC' &&
    numericPatterns.some((pattern) => pattern.test(lowerQuestion))
  ) {
    return {
      suggestedType: 'MULTI_NUMERIC',
      reason: 'This question asks for a numeric value',
      confidence: 'high',
    }
  }

  // MULTIPLE_CHOICE market suggestions
  const multipleChoiceIndicators = [
    / or /,
    /^which /,
    /^who will win/,
    /^which team/,
    /^which party/,
    /^which candidate/,
    /^what will happen/,
  ]

  const hasMultipleOptions =
    (lowerQuestion.match(/ or /g) || []).length >= 2 ||
    /\b(a|b|c|d)\)/.test(lowerQuestion)

  if (
    currentType === 'BINARY' &&
    (hasMultipleOptions ||
      multipleChoiceIndicators.some((pattern) => pattern.test(lowerQuestion)))
  ) {
    return {
      suggestedType: 'MULTIPLE_CHOICE',
      suggestedShouldSumToOne: true,
      reason: 'This question seems to have multiple possible outcomes',
      confidence: hasMultipleOptions ? 'high' : 'medium',
    }
  }

  // POLL suggestions
  const pollPatterns = [
    /^what is your (favorite|favourite)/,
    /^what do you (think|prefer|like)/,
    /^which do you/,
    /^do you prefer/,
    /^vote for/,
  ]

  if (
    currentType !== 'POLL' &&
    pollPatterns.some((pattern) => pattern.test(lowerQuestion))
  ) {
    return {
      suggestedType: 'POLL',
      reason: 'This question asks for opinions or preferences',
      confidence: 'medium',
    }
  }

  return null
}
