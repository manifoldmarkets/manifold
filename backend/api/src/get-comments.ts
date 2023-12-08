import { APIError, typedEndpoint } from './helpers'
import { SupabaseClient, createSupabaseClient } from 'shared/supabase/init'
import { getComments as getCommentsSupabase } from 'shared/supabase/contract_comments'

export const getComments = typedEndpoint('comments', async (props) => {
  const { userId, limit, page, contractSlug } = props

  if (!props.contractId && !contractSlug && !userId) {
    throw new APIError(400, 'You must specify a contract or user')
  }

  const db = createSupabaseClient()

  const contractId =
    props.contractId ?? (await getContractId(db, contractSlug as string))

  return getCommentsSupabase(db, { contractId, userId, limit, page })
})

const getContractId = async (db: SupabaseClient, slug: string) => {
  const { data, error } = await db
    .from('contracts')
    .select('id')
    .eq('slug', slug)
    .single()

  if (error) throw new APIError(404, 'Contract not found')
  return data.id
}
