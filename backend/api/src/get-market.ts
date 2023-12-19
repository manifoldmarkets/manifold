import { createSupabaseClient } from 'shared/supabase/init'
import { APIError } from './helpers'
import { toFullMarket, toLiteMarket } from 'common/api/market-types'
import { convertContract } from 'common/supabase/contracts'

export const getMarket = async (
  props: ({ id: string } | { slug: string }) & { lite?: boolean }
) => {
  const db = createSupabaseClient()
  const q = db.from('contracts').select()
  if ('id' in props) {
    q.eq('id', props.id)
  } else {
    q.eq('slug', props.slug)
  }
  const { data, error } = await q.single()
  if (error) throw new APIError(404, 'Contract not found')

  const contract = convertContract(data)
  return props.lite ? toLiteMarket(contract) : toFullMarket(contract)
}
