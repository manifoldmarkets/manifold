import { APIError } from 'common/api/utils'
import {
  Contract,
  CPMMMultiContract,
  nativeContractColumnsArray,
} from 'common/contract'
import { isAdminId } from 'common/envs/constants'
import { convertAnswer, convertContract } from 'common/supabase/contracts'
import { Tables } from 'common/supabase/utils'
import { camelCase, mapValues, sortBy } from 'lodash'
import { parseAIResponseAsJson, promptGemini } from 'shared/helpers/gemini'
import { generateEmbeddings } from 'shared/helpers/openai-utils'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { contractColumnsToSelect, log } from 'shared/utils'
import { broadcastUpdatedContract } from 'shared/websockets/helpers'
import { DataUpdate, update, updateData } from './utils'
// used for API to allow slug as param
export const getContractIdFromSlug = async (
  pg: SupabaseDirectClient,
  slug?: string
) => {
  if (!slug) return undefined
  const id = await pg.oneOrNone(
    `select id from contracts where slug = $1`,
    [slug],
    (r) => r?.id as string
  )
  if (!id) throw new APIError(400, 'No contract found with that slug')
  return id
}

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

export const getUniqueVoterIds = async (
  contractId: string,
  pg: SupabaseDirectClient
) => {
  return await pg.map(
    `select distinct user_id
       from votes cb
        where contract_id = $1
       `,
    [contractId],
    (r) => r.user_id
  )
}

export const getContractsDirect = async (
  contractIds: string[],
  pg: SupabaseDirectClient
) => {
  if (contractIds.length === 0) return [] as Contract[]

  const results = await pg.multi(
    `select ${contractColumnsToSelect} from contracts
            where id in ($1:list);
            select * from answers where contract_id in ($1:list);
            `,
    [contractIds]
  )
  const contracts = results[0].map(convertContract)
  const answers = results[1].map(convertAnswer)
  const multiContracts = contracts.filter((c) => c.mechanism === 'cpmm-multi-1')
  for (const contract of multiContracts) {
    // eslint-disable-next-line no-extra-semi
    ;(contract as CPMMMultiContract).answers = sortBy(
      answers.filter((a) => a.contractId === contract.id),
      (a) => a.index
    )
  }
  return contracts
}

export const getUniqueBettorIdsForAnswer = async (
  contractId: string,
  answerId: string,
  pg: SupabaseDirectClient
) => {
  const res = await pg.manyOrNone(
    `select distinct user_id
      from contract_bets
      where contract_id = $1
      and answer_id = $2
      and is_redemption = false`,
    [contractId, answerId]
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

export const getContractLikerIds = async (
  contractId: string,
  pg: SupabaseDirectClient
) => {
  const likedUserIds = await pg.manyOrNone<{ user_id: string }>(
    `select user_id from user_reactions
               where content_id = $1
               and content_type = 'contract'`,
    [contractId]
  )
  return likedUserIds.map((r) => r.user_id)
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
  const groupIds = contractGroups.map((cg) => cg.group_id)

  if (groupIds.length === 0) return []
  const contractGroupMemberIds = await pg.manyOrNone<{ member_id: string }>(
    `select distinct member_id from group_members
                where group_id = any($1)`,
    [groupIds]
  )
  return contractGroupMemberIds.map((r) => r.member_id)
}

export const isContractNonPredictive = async (contract: Contract) => {
  const isStonk = contract.outcomeType === 'STONK'
  if (isStonk) return true

  const questionIncludesDailyCoinflip =
    (contract.question.trim().toLowerCase().includes('coin') &&
      contract.question.trim().toLowerCase().includes('flip')) ||
    contract.question.trim().toLowerCase().includes('Daily 4 sided dice roll')
  if (questionIncludesDailyCoinflip) return true

  if (contract.creatorUsername === 'ManifoldLove') return true

  // Check for self-referential markets using Gemini
  const systemPrompt = `You are a market analysis assistant. Your task is to determine if a market question is self-referential - meaning it refers to itself, its own traders, or its own resolution in a way that makes it non-predictive.

Examples of self-referential markets:
${unrankedMarketExamples}

Examples of non-self-referential markets:
- "Will the S&P 500 be above 5000 by the end of 2024?"
- "Will Biden win the 2024 election?"
- "Will SpaceX launch Starship in 2024?"

Respond with a JSON object containing:
{
  "isSelfReferential": boolean,
}`

  try {
    const response = await promptGemini(contract.question, {
      system: systemPrompt,
    })
    const result = parseAIResponseAsJson(response)
    return result.isSelfReferential
  } catch (error) {
    log.error('Error checking for self-referential market:', {
      error: error instanceof Error ? error.message : String(error),
    })
    return false // Default to false if we can't determine
  }
}

const unrankedMarketExamples = `
Will all individual "YES" traders in this market a unique MAX PAYOUT when this market closes?

One year from now, will the percentage that this question resolves YES (as shown by Manifold) be above 50%?

Daily coinflip

Will my net worth be above Ṁ20,000 in a week?

Will the standard deviation of the bets on this question exceed 80?

Will this question get X traders before April 1 first 2025

Will this question get over 999.5 traders by 2030

Will this market get at least 77 traders by the end of 2025?

If this market stays ≥97% for 24 hours straight, it resolves YES. If it stays ≤3% for 24 hours straight, it resolves NO.
Will 'Will the majority of traders hold "no" when this market closes?' close with a trader holding >=500 shares?

Will this market have less than 25 participants on close (in one day)?

Will this market resolve between 30.01% and 69.99%?

This market resolves YES if chance >=50% at time of closing January 9th. Otherwise NO.
`

export const getContractPrivacyWhereSQLFilter = (
  uid: string | undefined,
  contractIdString: string,
  creatorId?: string
) => {
  const otherVisibilitySQL = `
  OR (visibility = 'unlisted'
    AND (
     creator_id='${uid}'
     OR ${isAdminId(uid ?? '_')}
     OR exists(
         select 1 from contract_bets where contract_id = ${contractIdString} and user_id = '${uid}')
     ))`
  return !!creatorId && !!uid && creatorId === uid
    ? ''
    : `(visibility = 'public' ${uid ? otherVisibilitySQL : ''})`
}

export const getUsersWithAccessToContract = async (
  contract: Contract,
  pg: SupabaseDirectClient
): Promise<string[]> => {
  return await pg.map(
    `
    select member_id FROM group_members
    JOIN group_contracts ON group_members.group_id = group_contracts.group_id
    WHERE group_contracts.contract_id = $1
    `,
    [contract.id],
    (row: { member_id: string }) => row.member_id
  )
}

export const generateContractEmbeddings = async (
  contract: Contract,
  pg: SupabaseDirectClient
) => {
  const embedding = await generateEmbeddings(contract.question)
  if (!embedding) return

  return await pg.one(
    `insert into contract_embeddings (contract_id, embedding)
            values ($1, $2)
            on conflict (contract_id) do nothing
            returning embedding
          `,
    [contract.id, embedding]
  )
}

export const updateContract = async (
  pg: SupabaseDirectClient,
  contractId: string,
  // TODO: can't figure out how to exclude native columns from DataUpdate
  update: DataUpdate<'contracts'>
) => {
  if (Object.keys(update).some((k) => nativeContractColumnsArray.includes(k))) {
    throw new APIError(500, 'Cannot update native columns via data update')
  }
  const fullUpdate = { ...update, id: contractId }
  const newContract = convertContract(
    await updateData(pg, 'contracts', 'id', fullUpdate)
  )
  log('updated contract', update)
  const updatedValues = mapValues(
    fullUpdate,
    (_, k) => newContract[k as keyof Contract] ?? null
  ) as any
  broadcastUpdatedContract(newContract.visibility, updatedValues)
  return newContract
}

export const updateContractNativeColumns = async (
  pg: SupabaseDirectClient,
  contractId: string,
  updated: Tables['contracts']['Update']
) => {
  const fullUpdate = { ...updated, id: contractId }
  const newContract = convertContract(
    await update(pg, 'contracts', 'id', fullUpdate)
  )
  log('updated contract native columns', updated)
  const updatedValues = Object.fromEntries(
    Object.entries(fullUpdate).map(([k, v]) => [camelCase(k), v])
  ) as Partial<Contract> & { id: string }
  broadcastUpdatedContract(newContract.visibility, updatedValues)
  return newContract
}

export const boostContractImmediately = async (
  pg: SupabaseDirectClient,
  contract: Contract
) => {
  await updateContractNativeColumns(pg, contract.id, {
    boosted: true,
    importance_score: Math.min(
      Math.max(contract.importanceScore + 0.5, 0.9),
      1
    ),
  })
}
