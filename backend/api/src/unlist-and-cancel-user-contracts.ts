import * as admin from 'firebase-admin'
import { APIError, type APIHandler } from './helpers/endpoint'
import { isAdminId, isModId } from 'common/envs/constants'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import { createSupabaseClient } from 'shared/supabase/init'

export const unlistAndCancelUserContracts: APIHandler<
  'unlist-and-cancel-user-contracts'
> = async ({ userId }, auth) => {
  if (!isAdminId(auth.uid) && !isModId(auth.uid)) {
    throw new APIError(403, 'Only admins and mods can perform this action.')
  }

  await throwErrorIfNotMod(auth.uid)

  const db = createSupabaseClient()
  const { data, error } = await db
    .from('contracts')
    .select('id')
    .eq('creatorId', userId)
  if (error) {
    throw new APIError(500, 'Failed to fetch contracts: ' + error.message)
  }

  if (data.length === 0) {
    console.log('No contracts found for this user.')
    return
  }

  if (data.length > 5) {
    throw new APIError(
      400,
      `This user has ${data.length} markets. You can only super ban users with 5 or less.`
    )
  }

  try {
    await Promise.all(
      data.map(({ id }) => {
        return firestore.doc(`contracts/${id}`).update({
          visibility: 'unlisted',
          resolution: 'CANCEL',
        })
      })
    )
  } catch (error) {
    console.error('Error updating contracts:', error)
    throw new APIError(500, 'Failed to update one or more contracts.')
  }
}

const firestore = admin.firestore()
