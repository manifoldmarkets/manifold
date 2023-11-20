import { z } from 'zod'
import * as dayjs from 'dayjs'
import { APIError, authEndpoint, validate } from 'api/helpers'
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
import { DAY_MS, HOUR_MS, MONTH_MS } from 'common/util/time'
import { createPrivateUserMessageChannelMain } from 'api/create-private-user-message-channel'
import { createPrivateUserMessageMain } from 'api/create-private-user-message'
import { contentSchema } from 'shared/zod-types'
import { JSONContent } from '@tiptap/core'
import { ChatVisibility } from 'common/chat-message'

const MIN_BET_AMOUNT_FOR_NEW_MATCH = 50

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
    auth.uid,
    userId1,
    userId2,
    betAmount,
    introduction,
    log
  )
})

export const createMatchMain = async (
  authUserId: string,
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
    where data->>'loverUserId1' = $1
    and data->>'loverUserId2' = $2`,
    [userId1, userId2],
    (r) => r.data
  )
  const unresolvedMultiLoverContracts = loverContracts.filter(
    (c) => !c.isResolved && c.outcomeType === 'MULTIPLE_CHOICE'
  )
  if (unresolvedMultiLoverContracts.length > 0) {
    log('loverContracts', { loverContracts })
    throw new APIError(400, `Match market already exists.`)
  }

  const thirtyDaysLaterStr = dayjs(
    Date.now() + DAY_MS * 30 + 7 * HOUR_MS
  ).format('MMM D')
  const eightMonthsLater = new Date(Date.now() + 8 * MONTH_MS)

  const contract = (await createMarketHelper(
    {
      question: `Relationship of @${user1.username} & @${user2.username}`,
      answers: [
        `First date by ${thirtyDaysLaterStr}?`,
        `If first date, second date within one month?`,
        `If second date, third date within one month?`,
        `If third date, continue relationship for six months?`,
      ],
      descriptionMarkdown: `Are [${user1.name}](https://manifold.love/${user1.username}) and [${user2.name}](https://manifold.love/${user2.username}) a good match? Bet on whether they will hit any of these relationship milestones! 
  
  
Each of the milestones beyond the first date is conditional on the previous milestone. For example, if the first date answer resolves NO, the others will resolve N/A.
  
  
See [FAQ](https://manifold.love/faq) for more details.`,
      extraLiquidity: 500,
      outcomeType: 'MULTIPLE_CHOICE',
      shouldAnswersSumToOne: false,
      addAnswersMode: 'DISABLED',
      groupIds: [manifoldLoveRelationshipsGroupId],
      visibility: 'public',
      closeTime: eightMonthsLater,
      loverUserId1: userId1,
      loverUserId2: userId2,
      matchCreatorId: matchCreator.id,
    },
    { uid: manifoldLoveUserId, creds: undefined as any },
    log
  )) as CPMMMultiContract

  const { answers } = contract

  const noBetAmounts = [500, 300, 150, 300]
  await Promise.all(
    answers.map(async (a, i) => {
      await placeBetMain(
        {
          contractId: contract.id,
          answerId: a.id,
          amount: noBetAmounts[i],
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
          contractId: contract.id,
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
    await createNewMatchNotification(user1, matchCreator, user2, contract, pg)
  }
  if (matchCreator.id !== user2.id) {
    await createNewMatchNotification(user2, matchCreator, user1, contract, pg)
  }
  const { channelId } = await createPrivateUserMessageChannelMain(
    matchCreator.id,
    [user1.id, user2.id],
    pg
  )
  const isExternalMatchmaker = ![user1.id, user2.id].includes(matchCreator.id)
  const messages = [
    isExternalMatchmaker
      ? [introSystemMessage(matchCreator.name, introduction), 'system_status']
      : [introSystemMessage(matchCreator.name, undefined), 'system_status'],
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
    contract,
  }
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
