export default function getQuestionSize(
  question: string
): 'text-lg' | 'text-2xl' | 'text-4xl' {
  const questionLength = question.length
  if (questionLength >= 100) return 'text-lg'
  if (questionLength < 100 && questionLength >= 40) return 'text-2xl'
  return 'text-4xl'
}

export function isStatusAFailure(
  betStatus: 'loading' | 'success' | string | undefined
) {
  return betStatus && betStatus != 'loading' && betStatus != 'success'
}

export const BUFFER_CARD_COLOR = 'bg-gray-700'
export const BUFFER_CARD_OPACITY = 'opacity-70'
export const STARTING_BET_AMOUNT = 10
export const BET_TAP_ADD = 10
