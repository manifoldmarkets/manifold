import { APIResponseOptionalContinue } from 'common/api/schema'
import { APIError } from 'common/api/utils'
import { CPMMMultiContract, Contract } from 'common/contract'
import { User } from 'common/user'
import { groupBy, mapValues } from 'lodash'
import {
  ResolutionParams,
  resolveMarketHelper,
} from 'shared/resolve-market-helpers'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { GCPLog, getUser } from 'shared/utils'

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

export const getCreatorMutuallyMessagedUserIds = async (
  creatorIds: string[]
) => {
  const pg = createSupabaseDirectClient()
  const mutualMessageData = await pg.manyOrNone<{
    creator_id: string
    mutual_id: string
    channel_id: string
  }>(
    `
    SELECT
        p1.user_id AS creator_id,
        p2.user_id AS mutual_id,
        p1.channel_id
    FROM
        private_user_messages p1
    JOIN
        private_user_messages p2 ON p1.channel_id = p2.channel_id AND p1.user_id != p2.user_id
    WHERE
        p1.user_id = any($1)
    GROUP BY
        p1.user_id, p2.user_id, p1.channel_id
    `,
    [creatorIds]
  )
  return mapValues(
    groupBy(mutualMessageData, (r) => r.creator_id),
    (v) => v.map((r) => r.mutual_id)
  )
}

export const getMutuallyMessagedUserIds = async (creatorId: string) => {
  return (await getCreatorMutuallyMessagedUserIds([creatorId]))[creatorId]
}

export const resolveLoveMarketOtherAnswers = async (
  contract: Contract,
  resolver: User,
  creator: User,
  resolutionParams: ResolutionParams,
  log: GCPLog
) => {
  if (
    !(
      contract.outcomeType === 'MULTIPLE_CHOICE' &&
      contract.mechanism === 'cpmm-multi-1'
    )
  ) {
    throw new APIError(400, 'Invalid love market type')
  }
  log(`Resolving other answers for love market ${contract.slug}`)

  const { answerId } = resolutionParams
  const otherAnswers = contract.answers.filter(
    (a) => a.id !== answerId && !a.resolution
  )
  const mutuallyMessagedUserIds = await getMutuallyMessagedUserIds(
    contract.creatorId
  )
  for (const otherAnswer of otherAnswers) {
    const { loverUserId } = otherAnswer
    const haveMutuallyMessaged =
      loverUserId && mutuallyMessagedUserIds.includes(loverUserId)
    const outcome = haveMutuallyMessaged ? 'NO' : 'N/A'

    log(`Resolving ${otherAnswer.text} to ${outcome}`)

    await resolveMarketHelper(
      contract,
      resolver,
      creator,
      {
        outcome,
        answerId: otherAnswer.id,
      },
      log
    )
  }
}
