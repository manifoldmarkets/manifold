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
import { uniq } from 'lodash'
import { sendInterestingMarketsEmail } from 'shared/emails'
import { getTrendingContracts } from 'shared/utils'
import { secrets } from 'common/secrets'
import { createSupabaseClient } from 'shared/supabase/init'
import { PrivateUser } from 'common/user'
import { SupabaseClient } from '@supabase/supabase-js'

const USERS_TO_EMAIL = 500
const numContractsToSend = 6
const GROUP_SLUGS_TO_IGNORE_IN_TRENDING = [
  'manifold-features',
  'manifold-6748e065087e',
  'destinygg',
]

// This should(?) work until we have ~60k users (500 * 120)
export const weeklyMarketsEmails = functions
  .runWith({ secrets, memory: '4GB', timeoutSeconds: 540 })
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

  for (const privateUser of privateUsersToSendEmailsTo) {
    await firestore
      .collection('private-users')
      .doc(privateUser.id)
      .update({
        weeklyTrendingEmailSent: true,
      })
      .catch((e) => log('error updating weeklyTrendingEmailSent', e))
  }

  log(
    'Sending weekly trending emails to',
    privateUsersToSendEmailsTo.length,
    'users'
  )

  const db = createSupabaseClient()

  const fallbackContracts = await getUniqueTrendingContracts()
  let sent = 0

  for (const privateUser of privateUsersToSendEmailsTo) {
    await sendEmailToPrivateUser(privateUser, fallbackContracts, db)
      .then(() =>
        log('sent email to', privateUser.email, ++sent, '/', USERS_TO_EMAIL)
      )
      .catch((e) => log('error sending email', e))
  }
}

const sendEmailToPrivateUser = async (
  privateUser: PrivateUser,
  fallbackContracts: Contract[],
  db: SupabaseClient
) => {
  if (!privateUser.email) return

  const { data } = await db.rpc('get_recommended_contracts_embeddings', {
    uid: privateUser.id,
    n: 15,
    excluded_contract_ids: [],
  })

  const recommendations = (data ?? []).map((row: any) => row.data as Contract)

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
