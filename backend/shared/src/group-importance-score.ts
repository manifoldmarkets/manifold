import { SupabaseDirectClient } from 'shared/supabase/init'
import { Contract } from 'common/contract'
import { orderBy, uniq } from 'lodash'

import { bulkUpdate } from 'shared/supabase/utils'
import { average } from 'common/util/math'

export async function calculateGroupImportanceScore(
  pg: SupabaseDirectClient,
  readOnly = false
) {
  const importantContracts = await pg.map(
    `select data from contracts where importance_score > 0.2`,
    [],
    (row) => row.data as Contract
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
      ).slice(0, 20),
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
          mostImportantContractsByGroupId[id]
        ),
      }))
    )
}

//TODO: probably will want to do something more sophisticated here,
// just averages the top n contracts by importance score for now
const calculateGroupImportanceScoreForGroup = (contracts: Contract[]) => {
  return average(contracts.map((c) => c.importanceScore))
}
