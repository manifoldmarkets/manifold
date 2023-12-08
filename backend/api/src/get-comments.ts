import { APIError, typedEndpoint } from './helpers'
import { createSupabaseClient } from 'shared/supabase/init'
import { getComments as getCommentsSupabase } from 'shared/supabase/contract_comments'
import { getContractIdFromSlug } from 'shared/supabase/contracts'

export const getComments = typedEndpoint('comments', async (props) => {
  const { userId, limit, page, contractSlug } = props

  if (!props.contractId && !contractSlug && !userId) {
    throw new APIError(400, 'You must specify a contract or user')
  }

  const db = createSupabaseClient()

  const contractId =
    props.contractId ?? (await getContractIdFromSlug(db, contractSlug))

  return getCommentsSupabase(db, { contractId, userId, limit, page })
})
