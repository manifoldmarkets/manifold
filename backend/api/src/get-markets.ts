import { createSupabaseDirectClient } from 'shared/supabase/init'
import { convertAnswer, convertContract } from 'common/supabase/contracts'
import { contractColumnsToSelect } from 'shared/utils'
import { CPMMMultiContract } from 'common/contract'
import { APIHandler } from './helpers/endpoint'
import { sortBy } from 'lodash'

export const getMarketsByIds: APIHandler<'markets-by-ids'> = async (props) => {
  const pg = createSupabaseDirectClient()
  const results = await pg.multi(
    `select ${contractColumnsToSelect} from contracts
            where id in ($1:list);
            select * from answers where contract_id in ($1:list);
            `,
    [props.ids]
  )
  const contracts = results[0].map(convertContract)
  const answers = results[1].map(convertAnswer)
  const multiContracts = contracts.filter((c) => c.mechanism === 'cpmm-multi-1')
  for (const contract of multiContracts) {
    ;(contract as CPMMMultiContract).answers = sortBy(
      answers.filter((a) => a.contractId === contract.id),
      (a) => a.index
    )
  }
  return contracts
}
