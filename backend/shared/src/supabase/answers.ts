import { SupabaseDirectClient } from 'shared/supabase/init'
import { convertAnswer } from 'common/supabase/contracts'
import { groupBy } from 'lodash'

export const getAnswersForContractsDirect = async (
  pg: SupabaseDirectClient,
  contractIds: string[]
) => {
  if (contractIds.length === 0) {
    return {}
  }
  return groupBy(
    await pg.map(
      `select * from answers
    where contract_id in ($1:list)`,
      [contractIds],
      (r) => convertAnswer(r)
    ),
    'contractId'
  )
}
