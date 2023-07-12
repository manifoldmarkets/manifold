import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { Contract } from 'common/contract'
import {
  getAllPrivateUsers,
  getPrivateUser,
  getUser,
  isProd,
  log,
} from 'shared/utils'
import { createRNG, shuffle } from 'common/util/random'
import { DAY_MS } from 'common/util/time'
import { filterDefined } from 'common/util/array'
import { orderBy, uniq } from 'lodash'
import { sendInterestingMarketsEmail } from 'shared/emails'
import { getTrendingContracts } from 'shared/utils'
import { secrets } from 'common/secrets'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { PrivateUser } from 'common/user'
import { Row } from 'common/supabase/utils'

const USERS_TO_EMAIL = 500
const numContractsToSend = 6
const GROUP_SLUGS_TO_IGNORE_IN_TRENDING = [
  'manifold-features',
  'manifold-6748e065087e',
  'destinygg',
]

// This should(?) work until we have ~60k users (500 * 120)
export const weeklyMarketsEmails = functions
  .runWith({ secrets, memory: '2GB', timeoutSeconds: 540 })
  // every minute on Monday for 2 hours starting at 12pm PT (UTC -07:00)
  .pubsub.schedule('* 19-20 * * 1')
  .timeZone('Etc/UTC')
  .onRun(async () => {
    await sendTrendingMarketsEmailsToAllUsers()
  })

const firestore = admin.firestore()

export async function sendTrendingMarketsEmailsToAllUsers(isDebug = false) {
  const privateUsers =
    !isProd() || isDebug
      ? filterDefined([
          await getPrivateUser('6hHpzvRG0pMq8PNJs7RZj2qlZGn2'), // dev Ian
        ])
      : await getAllPrivateUsers()

  const privateUsersToSendEmailsTo = privateUsers
    // Get all users that haven't unsubscribed from weekly emails
    .filter(
      (user) =>
        user.notificationPreferences.trending_markets.includes('email') &&
        !user.notificationPreferences.opt_out_all.includes('email') &&
        !user.weeklyTrendingEmailSent &&
        user.email
    )
    .slice(0, USERS_TO_EMAIL) // Send the emails out in batches

  if (privateUsersToSendEmailsTo.length === 0) {
    log('No users to send trending markets emails to')
    return
  }

  await Promise.all(
    privateUsersToSendEmailsTo.map((u) =>
      firestore
        .collection('private-users')
        .doc(u.id)
        .update({
          weeklyTrendingEmailSent: true,
        })
        .catch((e) => log('error updating weeklyTrendingEmailSent', e))
    )
  )

  log(
    'Sending weekly trending emails to',
    privateUsersToSendEmailsTo.length,
    'users'
  )

  const pg = createSupabaseDirectClient()
  const fallbackContracts = await getUniqueTrendingContracts()
  const userContracts = await getUsersRecommendedContracts(
    privateUsersToSendEmailsTo.map((u) => u.id),
    pg
  )
  let sent = 0
  await Promise.all(
    privateUsersToSendEmailsTo.map(async (pu) =>
      sendEmailToPrivateUser(pu, fallbackContracts, userContracts[pu.id])
        .then(() => log('sent email to', pu.email, ++sent, '/', USERS_TO_EMAIL))
        .catch((e) => log('error sending email', e))
    )
  )
}
export const getUsersRecommendedContracts = async (
  userIds: string[],
  pg: SupabaseDirectClient
) => {
  const userContractIds: { [userId: string]: string[] } = {}
  const userContracts: { [userId: string]: Contract[] } = {}
  await Promise.all(
    userIds.map(async (userId) => {
      await pg.map(
        ` select contract_id
                FROM user_feed
                WHERE user_id = $1
                and data_type = 'trending_contract'
                and contract_id is not null
                and seen_time is null ORDER BY created_time DESC LIMIT 25;
        `,
        [userId],
        (r: { contract_id: string }) => {
          if (!userContractIds[userId]) userContractIds[userId] = []
          userContractIds[userId].push(r.contract_id)
        }
      )
    })
  )
  const contracts = await pg.map(
    `select data from contracts where id = ANY($1)`,
    [uniq(Object.values(userContractIds).flat())],
    (r: Row<'contracts'>) => r.data as Contract
  )
  userIds.forEach((userId) => {
    userContracts[userId] = orderBy(
      contracts.filter((c) => uniq(userContractIds[userId]).includes(c.id)),
      (c) => -c.importanceScore
    )
  })
  return userContracts
}

const sendEmailToPrivateUser = async (
  privateUser: PrivateUser,
  fallbackContracts: Contract[],
  recommendations: Contract[]
) => {
  const contractsToSend = chooseRandomSubset(
    recommendations.length < numContractsToSend
      ? [...recommendations, ...fallbackContracts]
      : recommendations,
    numContractsToSend
  )

  const user = await getUser(privateUser.id)
  if (!user) return

  await sendInterestingMarketsEmail(user, privateUser, contractsToSend)
}

const getUniqueTrendingContracts = async () => {
  const trendingContracts = (await getTrendingContracts())
    .filter(
      (contract) =>
        !(
          contract.question.toLowerCase().includes('stock') &&
          contract.question.toLowerCase().includes('permanent')
        ) &&
        (contract?.closeTime ?? 0) > Date.now() + DAY_MS &&
        !contract.groupSlugs?.some((slug) =>
          GROUP_SLUGS_TO_IGNORE_IN_TRENDING.includes(slug)
        )
    )
    .slice(0, 50)

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
              (c2.popularityScore ?? 0) < (contract.popularityScore ?? 0)
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
