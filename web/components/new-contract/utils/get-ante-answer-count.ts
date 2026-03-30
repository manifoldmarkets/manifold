import { add_answers_mode } from 'common/contract'

export const getAnteAnswerCount = (
  answers: string[],
  addAnswersMode?: add_answers_mode,
  shouldAnswersSumToOne?: boolean
) => {
  const baseCount = answers.length
  const includeOther =
    (addAnswersMode === 'ONLY_CREATOR' || addAnswersMode === 'ANYONE') &&
    (shouldAnswersSumToOne ?? true)

  return baseCount + (includeOther ? 1 : 0)
}
