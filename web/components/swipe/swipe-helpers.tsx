export default function getQuestionSize(
  question: string
): 'text-2xl' | 'text-3xl' | 'text-4xl' | 'text-5xl' {
  const questionLength = question.length
  if (questionLength >= 200) return 'text-2xl'
  if (questionLength >= 100 && questionLength < 200) return 'text-3xl'
  if (questionLength >= 40 && questionLength < 100) return 'text-4xl'
  return 'text-5xl'
}

import { MAX_QUESTION_LENGTH } from 'common/contract'

export function isStatusAFailure(
  betStatus: 'loading' | 'success' | string | undefined
) {
  return betStatus && betStatus != 'loading' && betStatus != 'success'
}

export const BUFFER_CARD_COLOR = 'bg-gray-700'
export const BUFFER_CARD_OPACITY = 'opacity-70'

export const STARTING_BET_AMOUNT = 10
export const BET_TAP_ADD = 10
