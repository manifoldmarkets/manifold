import { APIResponseOptionalContinue } from 'common/api/schema'
import { CPMMMultiContract } from 'common/contract'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser } from 'shared/utils'

export const getUserLoveMarket = async (userId: string) => {
  const pg = createSupabaseDirectClient()
  return await pg.oneOrNone<CPMMMultiContract>(
    `select data from contracts
    where
      creator_id = $1
      and data->>'isLove' = 'true'
      and resolution is null
    `,
    [userId],
    (r) => (r ? r.data : null)
  )
}

export const addTargetToUserMarket = async (
  userId: string,
  targetUserId: string,
  createAnswer: (
    contractId: string,
    creatorId: string,
    targetUserId: string,
    text: string
  ) => Promise<APIResponseOptionalContinue<'market/:contractId/answer'>>
) => {
  const contract = await getUserLoveMarket(userId)
  if (!contract) return undefined

  const { answers } = contract
  if (answers.find((a) => a.loverUserId === targetUserId)) return undefined

  const targetUser = await getUser(targetUserId)
  if (!targetUser) return undefined

  const text = `${targetUser.name} (@${targetUser.username})`
  const result = await createAnswer(contract.id, userId, targetUserId, text)
  if (result && 'continue' in result) {
    await result.continue()
    return result.result
  }
  return result
}
