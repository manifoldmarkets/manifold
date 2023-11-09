import { z } from 'zod'
import { APIError, authEndpoint, validate } from 'api/helpers'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { getPrivateUser, getUser } from 'shared/utils'
import { createMarketHelper } from '../create-market'
import { Contract } from 'common/contract'
import { placeBetMain } from '../place-bet'
import { User } from 'common/user'
import * as crypto from 'crypto'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { Notification } from 'common/notification'
import { insertNotificationToSupabase } from 'shared/create-notification'
import { createPushNotification } from 'shared/create-push-notification'
import {
  manifoldLoveRelationshipsGroupId,
  manifoldLoveUserId,
} from 'common/love/constants'
import { sendNewMatchEmail } from 'shared/emails'

const createMatchSchema = z.object({
  userId1: z.string(),
  userId2: z.string(),
  betAmount: z.number().min(20),
})

const MATCH_CREATION_FEE = 10

export const createMatch = authEndpoint(async (req, auth) => {
  const { userId1, userId2, betAmount } = validate(createMatchSchema, req.body)
  if (userId1 === userId2) {
    throw new APIError(400, `User ${userId1} cannot match with themselves.`)
  }

  const db = createSupabaseClient()

  const [matchCreator, user1, user2] = await Promise.all([
    getUser(auth.uid),
    getUser(userId1),
    getUser(userId2),
  ])
  if (!matchCreator) {
    throw new APIError(404, `User ${auth.uid} does not exist.`)
  }
  if (!user1) {
    throw new APIError(404, `User ${userId1} does not exist.`)
  }
  if (!user2) {
    throw new APIError(404, `User ${userId2} does not exist.`)
  }
  const [{ data: lover1 }, { data: lover2 }] = await Promise.all([
    db.from('lovers').select('id').eq('user_id', userId1).single(),
    db.from('lovers').select('id').eq('user_id', userId2).single(),
  ])

  if (!lover1) {
    throw new APIError(400, `User ${userId1} does not have a love profile.`)
  }
  if (!lover2) {
    throw new APIError(400, `User ${userId2} does not have a love profile.`)
  }

  const [privateUser1, privateUser2] = await Promise.all([
    getPrivateUser(userId1),
    getPrivateUser(userId2),
  ])

  if (!privateUser1) {
    throw new APIError(400, `Private user ${userId1} not found.`)
  }
  if (privateUser1.blockedUserIds?.includes(userId2)) {
    throw new APIError(400, `User ${userId2} is blocked by ${userId1}.`)
  }
  if (!privateUser2) {
    throw new APIError(400, `Private user ${userId2} not found.`)
  }
  if (privateUser2.blockedUserIds?.includes(userId1)) {
    throw new APIError(400, `User ${userId1} is blocked by ${userId2}.`)
  }
  if (
    privateUser1.blockedUserIds?.includes(auth.uid) ||
    privateUser2.blockedUserIds?.includes(auth.uid)
  ) {
    throw new APIError(
      400,
      `User ${auth.uid} is blocked by ${userId1} or ${userId2}.`
    )
  }

  const pg = createSupabaseDirectClient()
  const loverContracts = await pg.map<Contract>(
    `select data from contracts
    where data->>'loverUserId1' = $1
    and data->>'loverUserId2' = $2`,
    [userId1, userId2],
    (r) => r.data
  )
  if (loverContracts.length > 0) {
    console.log('loverContracts', loverContracts)
    throw new APIError(400, `Match already exists.`)
  }

  const contract = await createMarketHelper(
    {
      question: `Will @${user1.username} and @${user2.username} date for six months?`,
      descriptionMarkdown: `Check out the profiles of these two and bet on their long term compatibility!

[${user1.name}](https://manifold.love/${user1.username})

[${user2.name}](https://manifold.love/${user2.username})`,
      extraLiquidity: 950,
      outcomeType: 'BINARY',
      groupIds: [manifoldLoveRelationshipsGroupId],
      visibility: 'public',
      closeTime: new Date('2100-01-01'),
      initialProb: 15,
      loverUserId1: userId1,
      loverUserId2: userId2,
    },
    { uid: manifoldLoveUserId, creds: undefined as any }
  )

  await placeBetMain(
    {
      contractId: contract.id,
      amount: 10000,
      outcome: 'NO',
    },
    manifoldLoveUserId,
    true
  )

  await placeBetMain(
    {
      contractId: contract.id,
      amount: betAmount - MATCH_CREATION_FEE,
      outcome: 'YES',
    },
    matchCreator.id,
    true
  )
  if (matchCreator.id !== user1.id) {
    await createNewMatchNotification(user1, matchCreator, user2, contract, pg)
  }
  if (matchCreator.id !== user2.id) {
    await createNewMatchNotification(user2, matchCreator, user1, contract, pg)
  }

  return {
    success: true,
    contract,
  }
})

const createNewMatchNotification = async (
  forUser: User,
  matchMaker: User,
  matchedUser: User,
  contract: Contract,
  pg: SupabaseDirectClient
) => {
  const privateUser = await getPrivateUser(forUser.id)
  if (!privateUser) return
  const id = crypto.randomUUID()
  const reason = 'new_match'
  const { sendToBrowser, sendToMobile, sendToEmail } =
    getNotificationDestinationsForUser(privateUser, reason)
  const sourceText = `Check out @${matchedUser.username} now!`
  const notification: Notification = {
    id,
    userId: privateUser.id,
    reason,
    createdTime: Date.now(),
    isSeen: false,
    sourceId: contract.id,
    sourceType: reason,
    sourceUpdateType: 'created',
    sourceUserName: matchMaker.name,
    sourceUserUsername: matchMaker.username,
    sourceUserAvatarUrl: matchMaker.avatarUrl,
    sourceText,
    sourceContractSlug: contract.slug,
    sourceContractId: contract.id,
    sourceContractTitle: contract.question,
    sourceContractCreatorUsername: contract.creatorUsername,
    data: {
      matchUserId: matchedUser.id,
      matchUserUsername: matchedUser.username,
      matchUserAvatarUrl: matchedUser.avatarUrl,
      matchUserName: matchedUser.name,
    },
  }
  if (sendToBrowser) {
    await insertNotificationToSupabase(notification, pg)
  }
  if (sendToMobile) {
    await createPushNotification(
      notification,
      privateUser,
      `You have a new potential match!`,
      sourceText
    )
  }
  if (sendToEmail) {
    await sendNewMatchEmail(
      reason,
      privateUser,
      contract,
      matchMaker.name,
      matchedUser
    )
  }
}
