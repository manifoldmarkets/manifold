export default function getQuestionSize(
  question: string
): 'text-lg' | 'text-2xl' | 'text-4xl' {
  const questionLength = question.length
  if (questionLength >= 100) return 'text-lg'
  if (questionLength < 100 && questionLength >= 40) return 'text-2xl'
  return 'text-4xl'
}

export const BUFFER_CARD_COLOR = 'bg-gray-700'
export const BUFFER_CARD_OPACITY = 'opacity-70'
