import { SupabaseDirectClient } from 'shared/supabase/init'
import { Contract } from 'common/contract'
import { map, orderBy, range, sum, uniq } from 'lodash'
import { bulkUpdate } from 'shared/supabase/utils'

const MARKETS_PER_GROUP = 50
const MIN_IMPORTANCE_SCORE = 0.05

export async function calculateGroupImportanceScore(
  pg: SupabaseDirectClient,
  readOnly = false
) {
  const importantContracts = await pg.map(
    `select importance_score, (data->'groupLinks') as group_links
            from contracts where importance_score > $1`,
    [MIN_IMPORTANCE_SCORE],
    (row) =>
      ({
        importanceScore: row.importance_score,
        groupLinks: row.group_links,
      } as Pick<Contract, 'groupLinks' | 'importanceScore'>)
  )

  const uniqueGroupIds = uniq(
    importantContracts
      .map((c) => (c.groupLinks ?? []).map((gl) => gl.groupId))
      .flat()
  )

  const mostImportantContractsByGroupId = Object.fromEntries(
    uniqueGroupIds.map((id) => [
      id,
      orderBy(
        importantContracts.filter((c) =>
          (c.groupLinks ?? []).map((gl) => gl.groupId).includes(id)
        ),
        (c) => -c.importanceScore
      ).slice(0, MARKETS_PER_GROUP),
    ])
  )

  if (!readOnly)
    await bulkUpdate(
      pg,
      'groups',
      ['id'],
      uniqueGroupIds.map((id) => ({
        id: id,
        importance_score: calculateGroupImportanceScoreForGroup(
          MARKETS_PER_GROUP,
          mostImportantContractsByGroupId[id].map((c) => c.importanceScore)
        ),
      }))
    )
}
// [sum from i = 1 to n of 1/i * (importance_i) ] / log n
function calculateGroupImportanceScoreForGroup(
  n: number,
  scoresOrderedByImportance: number[]
): number {
  const indexes = range(1, n + 1)
  const scoresSum = sum(
    map(indexes, (i) => (1 / i) * (scoresOrderedByImportance[i - 1] ?? 0))
  )
  return scoresSum / Math.log(n)
}
