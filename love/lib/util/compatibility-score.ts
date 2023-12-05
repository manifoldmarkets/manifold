import { keyBy, sumBy } from 'lodash'
import { LoverRow } from 'common/love/lover'
import { Row as rowFor } from 'common/supabase/utils'
import {
  areAgeCompatible,
  areRelationshipStyleCompatible,
  areLocationCompatible,
  areGenderCompatible,
} from './compatibility-util'

const importanceToScore = {
  0: 0,
  1: 1,
  2: 5,
  3: 25,
} as { [importance: string]: number }

export const getCompatibilityScore = (
  lover1: LoverRow,
  answers1: rowFor<'love_compatibility_answers'>[],
  lover2: LoverRow,
  answers2: rowFor<'love_compatibility_answers'>[]
) => {
  const { score: score1, maxScore: maxScore1 } = getAnswersCompatibility(
    answers1,
    answers2
  )
  const { score: score2, maxScore: maxScore2 } = getAnswersCompatibility(
    answers1,
    answers2
  )

  const downWeight = 10
  const compat1 = score1 / (maxScore1 + downWeight)
  const compat2 = score2 / (maxScore2 + downWeight)
  const multiplier = getLoversCompatibility(lover1, lover2)

  return multiplier * Math.sqrt(compat1 * compat2)
}

const getLoversCompatibility = (lover1: LoverRow, lover2: LoverRow) => {
  let multiplier = 1
  multiplier *= areAgeCompatible(lover1, lover2) ? 1 : 0.5
  multiplier *= areRelationshipStyleCompatible(lover1, lover2) ? 1 : 0.5
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

  const score = sumBy(answers1, (a) => {
    const answer2 = answers2ByQuestionId[a.question_id]
    if (!answer2) return 0

    const importanceScore = importanceToScore[a.importance] ?? 0
    maxScore += importanceScore
    return a.pref_choices.includes(answer2.multiple_choice)
      ? importanceScore
      : 0
  })

  return { score, maxScore }
}
