export const horizontalSwipeDist = 80
export const verticalSwipeDist = 40

export default function getQuestionSize(question: string, cardHeight: number) {
  const questionLength = question.length
  if (cardHeight < 700) return questionLength > 95 ? 'text-lg' : 'text-xl'
  return questionLength >= 120 ? 'text-2xl' : 'text-3xl'

  /* Inga's version.
  const height2width = window.innerHeight / window.innerWidth
  if (height2width < 2.1) {
    if (questionLength >= 160) return 'text-sm'
    if (questionLength >= 100 && questionLength < 160) return 'text-md'
    if (questionLength >= 40 && questionLength < 100) return 'text-lg'
    return 'text-xl'
  } else if (height2width > 2.3) {
    if (questionLength >= 160) return 'text-md'
    if (questionLength >= 100 && questionLength < 160) return 'text-lg'
    if (questionLength >= 40 && questionLength < 100) return 'text-xl'
    return 'text-2xl'
  } else {
    if (questionLength > 230) return 'text-xl'
    if (questionLength < 230 && questionLength >= 160) return 'text-2xl'
    if (questionLength >= 100 && questionLength < 160) return 'text-3xl'
    if (questionLength >= 40 && questionLength < 100) return 'text-4xl'
    return 'text-5xl'
  }
  */
}

export function isStatusAFailure(
  betStatus: 'loading' | 'success' | string | undefined
) {
  return betStatus && betStatus != 'loading' && betStatus != 'success'
}

export const STARTING_BET_AMOUNT = 10
export const BET_TAP_ADD = 10
