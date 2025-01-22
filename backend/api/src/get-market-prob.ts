import { APIError } from 'common/api/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'
import { getCpmmProbability } from 'common/calculate-cpmm'

export const getMarketProb: APIHandler<'market/:id/prob'> = async (props) => {
  const pg = createSupabaseDirectClient()

  const results = await pg.multi(
    `select mechanism, data->>'p' as p, data->>'pool' as pool
     from contracts
     where id = $1;
     select id, prob from answers
     where contract_id = $1
     order by index;
     `,
    [props.id]
  )

  const contract = results[0][0] as {
    mechanism: string
    p: number
    pool: { [outcome: string]: number }
  } | null
  const answers = results[1]

  if (!contract) throw new APIError(404, 'Contract not found')

  if (contract.mechanism === 'cpmm-1') {
    return {
      prob: getCpmmProbability(contract.pool, contract.p),
    }
  }

  return {
    answerProbs: Object.fromEntries(answers.map((a) => [a.id, a.prob])) as {
      [answerId: string]: number
    },
  }
}
