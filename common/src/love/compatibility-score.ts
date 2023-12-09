import { keyBy, sumBy } from 'lodash'
import { LoverRow } from 'common/love/lover'
import { Row as rowFor } from 'common/supabase/utils'
import {
  areAgeCompatible,
  areRelationshipStyleCompatible,
  areLocationCompatible,
  areGenderCompatible,
  areWantKidsCompatible,
} from './compatibility-util'

const importanceToScore = {
  0: 0,
  1: 1,
  2: 5,
  3: 25,
} as { [importance: string]: number }

export type CompatibilityScore = {
  score: number
  confidence: 'low' | 'medium' | 'high'
}

export const getCompatibilityScore = (
  lover1: LoverRow,
  answers1: rowFor<'love_compatibility_answers'>[],
  lover2: LoverRow,
  answers2: rowFor<'love_compatibility_answers'>[]
): CompatibilityScore => {
  const {
    score: score1,
    maxScore: maxScore1,
    answerCount,
  } = getAnswersCompatibility(answers1, answers2)
  const { score: score2, maxScore: maxScore2 } = getAnswersCompatibility(
    answers2,
    answers1
  )

  const upWeight = 5
  const downWeight = 10
  const compat1 = (score1 + upWeight) / (maxScore1 + downWeight)
  const compat2 = (score2 + upWeight) / (maxScore2 + downWeight)
  const geometricMean = Math.sqrt(compat1 * compat2)

  const multiplier = getLoversCompatibility(lover1, lover2)
  const score = multiplier * geometricMean

  const confidence =
    answerCount < 10 ? 'low' : answerCount < 100 ? 'medium' : 'high'

  return { score, confidence }
}

const getLoversCompatibility = (lover1: LoverRow, lover2: LoverRow) => {
  let multiplier = 1
  multiplier *= areAgeCompatible(lover1, lover2) ? 1 : 0.5
  multiplier *= areRelationshipStyleCompatible(lover1, lover2) ? 1 : 0.5
  multiplier *= areWantKidsCompatible(lover1, lover2) ? 1 : 0.5
  multiplier *= areLocationCompatible(lover1, lover2) ? 1 : 0.1
  multiplier *= areGenderCompatible(lover1, lover2) ? 1 : 0.01
  return multiplier
}
const getAnswersCompatibility = (
  answers1: rowFor<'love_compatibility_answers'>[],
  answers2: rowFor<'love_compatibility_answers'>[]
) => {
  const answers2ByQuestionId = keyBy(answers2, 'question_id')
  let maxScore = 0
  let answerCount = 0

  const score = sumBy(answers1, (a) => {
    const answer2 = answers2ByQuestionId[a.question_id]
    if (!answer2) return 0

    answerCount++
    const importanceScore = importanceToScore[a.importance] ?? 0
    maxScore += importanceScore
    return getAnswerCompatibility(a, answer2)
  })

  return { score, maxScore, answerCount }
}

export function getAnswerCompatibility(
  answer1: rowFor<'love_compatibility_answers'> | undefined | null,
  answer2: rowFor<'love_compatibility_answers'> | undefined | null
) {
  if (!answer1 || !answer2 || answer1.importance < 0 || answer2.importance < 0)
    return 0

  const importanceScore = importanceToScore[answer1.importance] ?? 0
  return answer1.pref_choices.includes(answer2.multiple_choice)
    ? importanceScore
    : 0
}

export function getMutualAnswerCompatibility(
  answer1: rowFor<'love_compatibility_answers'>,
  answer2: rowFor<'love_compatibility_answers'>
) {
  if (answer1.importance <= 0 || answer2.importance <= 0) {
    return 0
  }

  return (
    (answer1.pref_choices.includes(answer2.multiple_choice) ? 0.5 : 0) +
    (answer2.pref_choices.includes(answer1.multiple_choice) ? 0.5 : 0)
  )
}
