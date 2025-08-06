import { toFullMarket, toLiteMarket } from 'common/api/market-types'
import { APIError } from 'common/api/utils'
import { convertAnswer, convertContract } from 'common/supabase/contracts'
import { first } from 'lodash'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { contractColumnsToSelect } from 'shared/utils'

export const getMarket = async (
  props: ({ id: string } | { slug: string }) & { lite?: boolean }
) => {
  const pg = createSupabaseDirectClient()
  const whereClause = 'id' in props ? 'id' : 'slug'
  const whereValue = 'id' in props ? props.id : props.slug

  const res = await pg.multi(
    `select ${contractColumnsToSelect} from contracts where ${whereClause} = $1 limit 1;
     select * from answers where contract_id = (select id from contracts where ${whereClause} = $1) order by index;`,
    [whereValue]
  )

  const contract = first(res[0].map(convertContract))
  if (!contract) throw new APIError(404, 'Contract not found')

  const answers = res[1].map(convertAnswer)
  if (contract && 'answers' in contract) {
    contract.answers = answers
  }

  return props.lite ? toLiteMarket(contract) : toFullMarket(contract)
}
