import { Contract } from 'common/contract'
import { createRNG, shuffle } from 'common/util/random'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { sortBy, uniq, uniqBy } from 'lodash'
import { getTrendingContractsToEmail, log } from 'shared/utils'
import { PrivateUser } from 'common/user'
import * as admin from 'firebase-admin'
import { GROUP_SLUGS_TO_IGNORE_IN_MARKETS_EMAIL } from 'common/envs/constants'

export const USERS_TO_EMAIL = 500
const numContractsToSend = 6

export async function getInterestingMarketsForUsers(
  privateUsers: PrivateUser[],
  firestore: admin.firestore.Firestore
) {
  await Promise.all(
    privateUsers.map((u) =>
      firestore
        .collection('private-users')
        .doc(u.id)
        .update({
          weeklyTrendingEmailSent: true,
        })
        .catch((e) => log('error updating weeklyTrendingEmailSent', e))
    )
  )

  log('Sending weekly trending emails to', privateUsers.length, 'users')

  const pg = createSupabaseDirectClient()
  const fallbackContracts = await getUniqueTrendingContracts()
  const userContracts = await getUsersRecommendedContracts(
    privateUsers.map((u) => u.id),
    pg
  )
  const contractsToSend: { [userId: string]: Contract[] } = {}

  privateUsers.forEach((u) => {
    contractsToSend[u.id] = chooseRandomSubset(
      userContracts[u.id].length < numContractsToSend
        ? [...userContracts[u.id], ...fallbackContracts]
        : userContracts[u.id],
      numContractsToSend
    )
  })

  return { contractsToSend }
}

export const getUsersRecommendedContracts = async (
  userIds: string[],
  pg: SupabaseDirectClient
) => {
  type ContractAndScore = Contract & {
    relevanceScore: number
  }
  const userContracts: { [userId: string]: ContractAndScore[] } = {}
  await Promise.all(
    userIds.map(async (userId) => {
      await pg.map(
        `
          select c.data, c.importance_score, uf.relevance_score
          from (select contract_id, relevance_score
                from user_feed
                where user_id = $1
                  and contract_id is not null
                  and seen_time is null
                and data_type != 'new_comment'
                and data_type != 'user_position_changed'
                order by relevance_score desc
                limit 100) uf
                   join contracts c on uf.contract_id = c.id
                    where not (c.data -> 'groupSlugs' ?| $2)
                      and c.creator_id != $1
                      and not exists(select 1
                        from contract_bets
                        where contract_id = c.id    
                          and user_id = $1) 
                      and not exists(select 1 from user_seen_markets
                        where user_id = $1
                        and contract_id = c.id)
          `,
        [userId, GROUP_SLUGS_TO_IGNORE_IN_MARKETS_EMAIL],
        (r: {
          data: any
          importance_score: number
          relevance_score: number
        }) => {
          const contract = {
            ...(r.data as Contract),
            importanceScore: r.importance_score,
            relevanceScore: r.relevance_score,
          } as ContractAndScore
          if (!userContracts[userId]) userContracts[userId] = []
          userContracts[userId].push(contract)
        }
      )
    })
  )

  userIds.forEach(
    (userId) =>
      (userContracts[userId] = uniqBy(
        sortBy(
          removeSimilarQuestions(
            userContracts[userId] ?? [],
            userContracts[userId] ?? [],
            true
          ) as ContractAndScore[],
          (c) => -(c.importanceScore / 3 + c.relevanceScore)
        ),
        'id'
      ))
  )

  return userContracts
}
const getUniqueTrendingContracts = async () => {
  const trendingContracts = (await getTrendingContractsToEmail()) ?? []

  return removeSimilarQuestions(
    trendingContracts,
    trendingContracts,
    true
  ).slice(0, 20)
}
// search contract array by question and remove contracts with 3 matching words in the question
const removeSimilarQuestions = (
  contractsToFilter: Contract[],
  byContracts: Contract[],
  allowExactSameContracts: boolean
) => {
  let contractsToRemove: Contract[] = []
  byContracts.length > 0 &&
    byContracts.forEach((contract) => {
      const contractQuestion = stripNonAlphaChars(
        contract.question.toLowerCase()
      )
      const contractQuestionWords = uniq(contractQuestion.split(' ')).filter(
        (w) => !IGNORE_WORDS.includes(w)
      )
      contractsToRemove = contractsToRemove.concat(
        contractsToFilter.filter(
          // Remove contracts with more than 2 matching (uncommon) words and a lower popularity score
          (c2) => {
            const significantOverlap =
              // TODO: we should probably use a library for comparing strings/sentiments
              uniq(
                stripNonAlphaChars(c2.question.toLowerCase()).split(' ')
              ).filter((word) => contractQuestionWords.includes(word)).length >
              2
            const lessPopular =
              (c2.importanceScore ?? 0) < (contract.importanceScore ?? 0)
            return (
              (significantOverlap && lessPopular) ||
              (allowExactSameContracts ? false : c2.id === contract.id)
            )
          }
        )
      )
    })
  // log(
  //   'contracts to filter out',
  //   contractsToRemove.map((c) => c.question)
  // )

  const returnContracts = contractsToFilter.filter(
    (cf) => !contractsToRemove.some((c) => c.id === cf.id)
  )

  return returnContracts
}
const fiveMinutes = 5 * 60 * 1000
const seed = Math.round(Date.now() / fiveMinutes).toString()
const rng = createRNG(seed)

function chooseRandomSubset(contracts: Contract[], count: number) {
  shuffle(contracts, rng)
  return contracts.slice(0, count)
}

function stripNonAlphaChars(str: string) {
  return str.replace(/[^\w\s']|_/g, '').replace(/\s+/g, ' ')
}

const IGNORE_WORDS = [
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'will',
  'be',
  'is',
  'are',
  'for',
  'by',
  'at',
  'from',
  'what',
  'when',
  'which',
  'that',
  'it',
  'as',
  'if',
  'then',
  'than',
  'but',
  'have',
  'has',
  'had',
]
