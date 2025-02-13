import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'
import { getCpmmProbability } from 'common/calculate-cpmm'
import { groupBy } from 'lodash'

export const getMarketProbs: APIHandler<'market-probs'> = async (props) => {
  const pg = createSupabaseDirectClient()

  const results = await pg.multi(
    `select id, mechanism, data->'p' as p, data->'pool' as pool
     from contracts
     where id = ANY($1);
     select contract_id, id, prob from answers
     where contract_id = ANY($1)
     order by index;
     `,
    [props.ids]
  )

  const contracts = results[0] as {
    id: string
    mechanism: string
    p: number
    pool: { [outcome: string]: number }
  }[]
  const answers = results[1] as {
    contract_id: string
    id: string
    prob: number
  }[]

  const probsByContract: {
    [contractId: string]: {
      prob?: number
      answerProbs?: { [answerId: string]: number }
    }
  } = {}

  // Group answers by contract
  const answersByContract = groupBy(answers, 'contract_id')

  // Calculate probs for each contract
  for (const contract of contracts) {
    if (contract.mechanism === 'cpmm-1') {
      probsByContract[contract.id] = {
        prob: getCpmmProbability(contract.pool, contract.p),
      }
    } else {
      const contractAnswers = answersByContract[contract.id] || []
      probsByContract[contract.id] = {
        answerProbs: Object.fromEntries(
          contractAnswers.map((a) => [a.id, a.prob])
        ),
      }
    }
  }

  return probsByContract
}
