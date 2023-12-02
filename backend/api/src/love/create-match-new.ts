import * as admin from 'firebase-admin'
import { z } from 'zod'
import { JSONContent } from '@tiptap/core'
import * as crypto from 'crypto'

import { APIError, AuthedUser, authEndpoint, validate } from 'api/helpers'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { GCPLog, getPrivateUser, getUser } from 'shared/utils'
import { createMarketHelper } from '../create-market'
import { CPMMMultiContract, Contract } from 'common/contract'
import { placeBetMain } from '../place-bet'
import { User } from 'common/user'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { Notification } from 'common/notification'
import { createPushNotification } from 'shared/create-push-notification'
import {
  MIN_BET_AMOUNT_FOR_NEW_MATCH,
  manifoldLoveRelationshipsGroupId,
  manifoldLoveUserId,
} from 'common/love/constants'
import { sendNewMatchEmail } from 'shared/emails'
import { createPrivateUserMessageChannelMain } from 'api/create-private-user-message-channel'
import { createPrivateUserMessageMain } from 'api/create-private-user-message'
import { contentSchema } from 'shared/zod-types'
import { ChatVisibility } from 'common/chat-message'
import { insertNotificationToSupabase } from 'shared/supabase/notifications'
import { createAnswerCpmmMain } from 'api/create-answer-cpmm'
import { Answer } from 'common/answer'

const createMatchSchema = z.object({
  userId1: z.string(),
  userId2: z.string(),
  introduction: contentSchema.optional(),
  betAmount: z.number().min(MIN_BET_AMOUNT_FOR_NEW_MATCH),
})

const MATCH_CREATION_FEE = 10

export const createMatch = authEndpoint(async (req, auth, log) => {
  const { userId1, userId2, betAmount, introduction } = validate(
    createMatchSchema,
    req.body
  )
  return await createMatchMain(
    auth,
    userId1,
    userId2,
    betAmount,
    introduction,
    log
  )
})

export const createMatchMain = async (
  auth: AuthedUser,
  userId1: string,
  userId2: string,
  betAmount: number,
  introduction: JSONContent | undefined,
  log: GCPLog
) => {
  if (userId1 === userId2) {
    throw new APIError(400, `User ${userId1} cannot match with themselves.`)
  }

  const db = createSupabaseClient()

  const authUserId = auth.uid
  const [matchCreator, user1, user2] = await Promise.all([
    getUser(authUserId),
    getUser(userId1),
    getUser(userId2),
  ])
  if (!matchCreator) {
    throw new APIError(404, `User ${authUserId} does not exist.`)
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
    privateUser1.blockedUserIds?.includes(authUserId) ||
    privateUser2.blockedUserIds?.includes(authUserId)
  ) {
    throw new APIError(
      400,
      `User ${authUserId} is blocked by ${userId1} or ${userId2}.`
    )
  }

  const pg = createSupabaseDirectClient()
  const loverContracts = await pg.map<Contract>(
    `select data from contracts
    where
    (creator_id = $1 or creator_id = $2)
    and data->>'matchCreator' is not null
    and data->>'loverUserId1' is null`,
    [userId1, userId2],
    (r) => r.data
  )
  const unresolvedMultiLoverContracts = loverContracts.filter(
    (c) => !c.isResolved && c.outcomeType === 'MULTIPLE_CHOICE'
  )

  let user1Contract = unresolvedMultiLoverContracts.find(
    (c) => c.creatorId === userId1
  )
  let user2Contract = unresolvedMultiLoverContracts.find(
    (c) => c.creatorId === userId2
  )
  if (!user1Contract) {
    user1Contract = await createMatchMarket(user1, log)
  }
  if (!user2Contract) {
    user2Contract = await createMatchMarket(user2, log)
  }

  const answerUser1 = await createMatchAnswer(
    user1Contract as CPMMMultiContract,
    user2,
    auth,
    log
  )
  const answerUser2 = await createMatchAnswer(
    user2Contract as CPMMMultiContract,
    user1,
    auth,
    log
  )

  const answers = [answerUser1, answerUser2]
  const noBetAmount = 500
  await Promise.all(
    [answerUser1, answerUser2].map(async (a) => {
      await placeBetMain(
        {
          contractId: a.contractId,
          answerId: a.id,
          amount: noBetAmount,
          outcome: 'NO',
        },
        manifoldLoveUserId,
        true,
        log
      )
    })
  )

  const amountAfterFee = betAmount - MATCH_CREATION_FEE
  const amountPerAnswer = amountAfterFee / answers.length
  await Promise.all(
    answers.map(async (a) => {
      await placeBetMain(
        {
          contractId: a.contractId,
          answerId: a.id,
          amount: amountPerAnswer,
          outcome: 'YES',
        },
        matchCreator.id,
        true,
        log
      )
    })
  )

  if (matchCreator.id !== user1.id) {
    await createNewMatchNotification(
      user1,
      matchCreator,
      user2,
      user1Contract!,
      pg
    )
  }
  if (matchCreator.id !== user2.id) {
    await createNewMatchNotification(
      user2,
      matchCreator,
      user1,
      user2Contract!,
      pg
    )
  }
  const { channelId } = await createPrivateUserMessageChannelMain(
    matchCreator.id,
    [user1.id, user2.id],
    pg
  )
  const isExternalMatchmaker = ![user1.id, user2.id].includes(matchCreator.id)
  const messages = [
    [
      introSystemMessage(
        matchCreator.name,
        isExternalMatchmaker ? introduction : undefined
      ),
      'system_status',
    ],
  ] as [JSONContent, ChatVisibility][]
  if (!isExternalMatchmaker && !!introduction) {
    messages.push([introduction, 'private'])
  }

  await Promise.all(
    messages.map(async ([message, visibility]) => {
      await createPrivateUserMessageMain(
        matchCreator,
        channelId,
        message,
        pg,
        log,
        visibility,
        visibility === 'system_status' ? manifoldLoveUserId : undefined
      )
    })
  )
  return {
    success: true,
    user1Contract,
    user2Contract,
  }
}

const createMatchMarket = async (user: User, log: GCPLog) => {
  const closeDate = new Date(`2100-01-01`)
  return (await createMarketHelper(
    {
      question: `Who will I (@${user.username}) next go on three dates with?`,
      answers: [],
      descriptionMarkdown: `See [${user.name}'s dating profile](https://manifold.love/${user.username}) for more info! 
  
  
See [FAQ](https://manifold.love/faq) for more details.`,
      extraLiquidity: 500,
      outcomeType: 'MULTIPLE_CHOICE',
      shouldAnswersSumToOne: false,
      addAnswersMode: 'ONLY_CREATOR',
      groupIds: [manifoldLoveRelationshipsGroupId],
      visibility: 'public',
      closeTime: closeDate,
    },
    { uid: user.id, creds: undefined as any },
    log
  )) as CPMMMultiContract
}

const createMatchAnswer = async (
  contract: CPMMMultiContract,
  matchedUser: User,
  auth: AuthedUser,
  log: GCPLog
) => {
  const answerText = `${matchedUser.name} (${matchedUser.username})`

  const { newAnswerId } = await createAnswerCpmmMain(
    auth,
    contract.id,
    answerText,
    log
  )

  const answer = await firestore
    .collection('contracts')
    .doc(contract.id)
    .collection('answersCpmm')
    .doc(newAnswerId)
    .get()
  return answer.data() as Answer
}

const introSystemMessage = (
  userName: string,
  content: JSONContent | undefined
) =>
  ({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            text: `${userName} proposed your match! ${
              content ? 'They said:' : ''
            }`,
            type: 'text',
          },
        ],
      },
    ].concat(content?.content ? content.content : ([] as any)),
  } as JSONContent)

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

const firestore = admin.firestore()
