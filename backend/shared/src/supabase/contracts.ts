import { SupabaseDirectClient } from 'shared/supabase/init'
import { uniq } from 'lodash'
import { getUserIdsInterestedInUser } from 'shared/supabase/users'

export const getUniqueBettorIds = async (
  contractId: string,
  pg: SupabaseDirectClient
) => {
  const res = await pg.manyOrNone(
    `
      select
          distinct user_id
      from contract_bets
        where contract_id = $1`,
    [contractId]
  )
  return res.map((r) => r.user_id as string)
}

export const getContractFollowerIds = async (
  contractId: string,
  pg: SupabaseDirectClient
) => {
  const followerIds = await pg.manyOrNone<{ follow_id: string }>(
    `select follow_id from contract_follows where contract_id = $1`,
    [contractId]
  )
  return followerIds.map((f) => f.follow_id)
}

export const getContractFollowerIdsMinusCreator = async (
  contractId: string,
  creatorId: string,
  pg: SupabaseDirectClient
) => {
  const contractFollowerIds = await getContractFollowerIds(contractId, pg)
  return contractFollowerIds.filter((userId) => userId !== creatorId)
}

export const getContractLikerIds = async (
  contractId: string,
  pg: SupabaseDirectClient
) => {
  const likedUserIds = await pg.manyOrNone<{ user_id: string[] }>(
    `select user_id from user_reactions 
               where (data->>'contentId') = $1
               and (data->>'type') = 'like'
               and (data->>'contentType') = 'contract'`,
    [contractId]
  )
  return likedUserIds.map((r) => r.user_id)
}

export const getContractViewerIds = async (
  contractId: string,
  pg: SupabaseDirectClient
) => {
  const viewerIds = await pg.manyOrNone<{ user_id: string[] }>(
    `select distinct user_id from user_seen_markets
                where contract_id = $1
                and type = 'view market'`,
    [contractId]
  )
  return viewerIds.map((r) => r.user_id)
}

export const getContractGroupMemberIds = async (
  contractId: string,
  pg: SupabaseDirectClient
) => {
  const contractGroups = await pg.manyOrNone(
    `select distinct group_id  from group_contracts
                where contract_id = $1`,
    [contractId]
  )
  const contractGroupMemberIds = await pg.manyOrNone(
    `select distinct member_id from group_members
                where group_id = any($1)`,
    [contractGroups.map((cg) => cg.group_id)]
  )
  return contractGroupMemberIds.map((r) => r.member_id)
}

const getUsersWithInterestVectorsNearToContract = async (
  contractId: string,
  pg: SupabaseDirectClient
) => {
  const userIdsAndDistances = await pg.manyOrNone(
    `with ce as (select embedding
                 from contract_embeddings
                 where contract_id = $1)
           select ue.user_id,
                  (select embedding from ce) <=> ue.interest_embedding as distance
           from user_embeddings as ue
           where (select embedding from ce) <=> ue.interest_embedding < 0.25
           order by (select embedding from ce) <=> ue.interest_embedding
           limit 10000;
    `,
    [contractId]
  )
  return userIdsAndDistances.map((r) => r.user_id)
}

// TODO: attach reasons to user ids ('similar interests', 'follows creator', 'liked contract', etc)
export const getUserIdsInterestedInContract = async (
  contractId: string,
  creatorId: string,
  pg: SupabaseDirectClient
) => {
  const [
    contractFollowerIds,
    contractLikerUserIds,
    contractViewerIds,
    contractGroupMemberIds,
    usersWithNearInterestVectors,
    userIdsInterestedInUser,
  ] = await Promise.all([
    getContractFollowerIds(contractId, pg),
    getContractLikerIds(contractId, pg),
    getContractViewerIds(contractId, pg),
    getContractGroupMemberIds(contractId, pg),
    getUsersWithInterestVectorsNearToContract(contractId, pg),
    getUserIdsInterestedInUser(creatorId, pg),
  ])
  return uniq([
    ...contractFollowerIds,
    ...contractLikerUserIds,
    ...contractViewerIds,
    ...contractGroupMemberIds,
    ...usersWithNearInterestVectors,
    ...userIdsInterestedInUser,
  ])
}
