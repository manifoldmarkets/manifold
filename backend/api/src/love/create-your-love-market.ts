import { z } from 'zod'
import { orderBy } from 'lodash'
import { APIError, authEndpoint } from 'api/helpers/endpoint'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { getPrivateUser, getUser } from 'shared/utils'
import { createMarketHelper } from '../create-market'
import { CPMMMultiContract, Contract } from 'common/contract'
import { User } from 'common/user'
import {
  LOVE_MARKET_COST,
  manifoldLoveRelationshipsGroupId,
} from 'common/love/constants'
import { getLikesAndShipsMain } from './get-likes-and-ships'

export const createYourLoveMarket = authEndpoint(async (req, auth, log) => {
  const userId = auth.uid
  const db = createSupabaseClient()

  const user = await getUser(userId)
  if (!user) {
    throw new APIError(404, `User ${userId} does not exist.`)
  }
  const { data: lover } = await db
    .from('lovers')
    .select('id')
    .eq('user_id', userId)
    .single()

  if (!lover) {
    throw new APIError(400, `User ${userId} does not have a love profile.`)
  }

  const privateUser = getPrivateUser(userId)

  if (!privateUser) {
    throw new APIError(400, `Private user ${userId} not found.`)
  }
  // if (
  //   privateUser1.blockedUserIds?.includes(authUserId) ||
  //   privateUser2.blockedUserIds?.includes(authUserId)
  // ) {
  //   throw new APIError(
  //     400,
  //     `User ${authUserId} is blocked by ${userId1} or ${userId2}.`
  //   )
  // }

  const pg = createSupabaseDirectClient()
  const loverContracts = await pg.map<Contract>(
    `select data from contracts
    where
      creator_id = $1 and
      data->>'isLove' = 'true'
    `,
    [userId],
    (r) => r.data
  )

  const unresolvedContracts = loverContracts.filter((c) => !c.isResolved)
  if (unresolvedContracts.length > 0) {
    log('loverContracts', { loverContracts })
    throw new APIError(400, `Match market already exists.`)
  }

  log(`Creating love market for @${user.username}`)

  const { likesGiven, likesReceived, ships } = await getLikesAndShipsMain(
    userId
  )
  const candidateIds = orderBy(
    [
      ...likesGiven,
      ...likesReceived,
      ...ships.map((s) => ({
        user_id: s.target_id,
        created_time: s.created_time,
      })),
    ],
    'created_time',
    'asc'
  ).map((l) => l.user_id)
  const candidateUsers = await pg.map<User>(
    `select data from users where id in ($1:list)`,
    [candidateIds],
    (r) => r.data
  )
  const answersAsText = candidateUsers.map((u) => `${u.name} (@${u.username})`)

  const twentyOneHundred = new Date(`2100-01-01T00:00:00-08:00`)

  const contract = (await createMarketHelper(
    {
      question: `Who will I go on 3 dates with?`,
      answers: answersAsText,
      descriptionMarkdown: `See [my profile](https://manifold.love/${user.username}) to get more info on me and the candidates.

This market resolves once I've gone on 3 dates with someone on Manifold Love.

The person I went on 3 dates with resolves YES. Other candidates where we have exchanged messages on Manifold Love resolve NO. Other candidates where we have not both exchanged messages resolve N/A.
  
See [FAQ](https://manifold.love/faq) for more details.`,
      outcomeType: 'MULTIPLE_CHOICE',
      shouldAnswersSumToOne: false,
      addAnswersMode: 'DISABLED',
      groupIds: [manifoldLoveRelationshipsGroupId],
      visibility: 'public',
      closeTime: twentyOneHundred,
      isLove: true,
      specialLiquidityPerAnswer: LOVE_MARKET_COST,
    },
    auth,
    log
  )) as CPMMMultiContract

  return {
    status: 'success',
    contract,
  }
})
