import { SupabaseDirectClient } from 'shared/supabase/init'
import { convertAnswer } from 'common/supabase/contracts'
import { groupBy } from 'lodash'
import { Answer } from 'common/answer'

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

export const replicateAnswers = async (
  pg: SupabaseDirectClient,
  answers: Answer[]
) => {
  return await Promise.all(
    answers.map(async (a) =>
      pg.none(
        `insert into answers (id, contract_id, data, fs_updated_time)
      values ($1, $2, $3, $4)
    on conflict (id) do nothing`,
        [a.id, a.contractId, a, new Date().toISOString()]
      )
    )
  )
}
