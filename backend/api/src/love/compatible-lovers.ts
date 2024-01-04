import { groupBy, uniq, sortBy } from 'lodash'
import { APIError, type APIHandler } from 'api/helpers/endpoint'
import { getCompatibilityScore } from 'common/love/compatibility-score'
import {
  getLover,
  getLoverContracts,
  getLovers,
  getCompatibleLovers as getCompatible,
  getCompatibilityAnswers,
} from 'shared/love/supabase'
import { filterDefined } from 'common/util/array'

export const getCompatibleLovers: APIHandler<'compatible-lovers'> = async (
  props,
  _auth,
  { log }
) => {
  const { userId } = props

  const [lover, loverContracts] = await Promise.all([
    getLover(userId),
    getLoverContracts(userId),
  ])

  log('got lover', {
    id: lover?.id,
    userId: lover?.user_id,
    username: lover?.user?.username,
  })

  log(
    'got lover contracts',
    loverContracts.map((c) => ({ id: c.id, question: c.question }))
  )

  if (!lover) throw new APIError(404, 'Lover not found')
  if (!lover.looking_for_matches)
    throw new APIError(403, 'Lover not looking for matches')

  const matchedUserIds = filterDefined(
    uniq(loverContracts.flatMap((c) => [c.loverUserId1, c.loverUserId2]))
  ).filter((id) => id !== userId)

  const [matchedLoversPrefiltered, allCompatibleLovers] = await Promise.all([
    getLovers(matchedUserIds),
    getCompatible(lover, undefined),
  ])
  const matchedLovers = matchedLoversPrefiltered.filter(
    (l) => !l.user.isBannedFromPosting
  )

  const matchesSet = new Set([
    ...loverContracts.map((contract) => contract.loverUserId1),
    ...loverContracts.map((contract) => contract.loverUserId2),
  ])
  const compatibleLovers = allCompatibleLovers.filter(
    (l) => !matchesSet.has(l.user_id)
  )

  const debug = false
  if (debug) {
    console.log(
      'got matched',
      matchedLovers.map((l) => ({
        id: l.id,
        username: l.user.username,
        user_id: l.user.id,
      }))
    )
    console.log(
      'got compatible',
      compatibleLovers.map((l) => ({
        id: l.id,
        username: l.user.username,
        user_id: l.user.id,
      }))
    )
  }

  const lovers = [...compatibleLovers, ...matchedLovers]
  const loverAnswers = await getCompatibilityAnswers([
    userId,
    ...lovers.map((l) => l.user_id),
  ])
  log('got lover answers ' + loverAnswers.length)

  const answersByUserId = groupBy(loverAnswers, 'creator_id')
  const loverCompatibilityScores = Object.fromEntries(
    lovers.map(
      (l) =>
        [
          l.user_id,
          getCompatibilityScore(
            lover,
            answersByUserId[lover.user_id] ?? [],
            l,
            answersByUserId[l.user_id] ?? []
          ),
        ] as const
    )
  )

  if (debug) log('got lover compatibility scores', loverCompatibilityScores)

  const filteredLoverContracts = loverContracts.filter((c) =>
    matchedLovers.some(
      (l) => l.user_id === c.loverUserId1 || l.user_id === c.loverUserId2
    )
  )
  const sortedLoverContracts = sortBy(
    filteredLoverContracts,
    (c) => -1 * c.answers.filter((ans) => ans.resolution).length,
    (c) => {
      const resolvedCount = c.answers.filter((ans) => ans.resolution).length
      const index = Math.min(resolvedCount, c.answers.length - 1)
      return -1 * c.answers[index].prob
    }
  )

  const sortedMatchedLovers = sortBy(matchedLovers, (l) =>
    sortedLoverContracts.findIndex(
      (c) => c.loverUserId1 === l.user_id || c.loverUserId2 === l.user_id
    )
  )

  const sortedCompatibleLovers = sortBy(
    compatibleLovers,
    (l) => loverCompatibilityScores[l.user_id].score
  ).reverse()

  return {
    status: 'success',
    lover,
    matchedLovers: sortedMatchedLovers,
    compatibleLovers: sortedCompatibleLovers,
    loverCompatibilityScores,
    loverContracts: sortedLoverContracts,
  }
}
