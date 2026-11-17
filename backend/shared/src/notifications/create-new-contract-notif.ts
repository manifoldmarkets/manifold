import { Notification } from 'common/notification'
import { User } from 'common/user'
import { Contract } from 'common/contract'
import {
  sendBulkEmails,
  getNewFollowedMarketEmail,
  EmailAndTemplateEntry,
} from '../emails'
import {
  getNotificationDestinationsForUser,
  notification_preference,
  userIsBlocked,
} from 'common/user-notification-preferences'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { insertNotificationsIfAbsent } from 'shared/supabase/notifications'
import { convertPrivateUser } from 'common/supabase/users'
import { NO_NEW_MARKET_EMAIL_CREATOR_IDS } from 'common/envs/constants'
import {
  getNewQuestionNotificationMode,
  NewQuestionNotificationMode,
  NewQuestionsDigestData,
  NEW_QUESTION_DIGEST_ENABLED,
  NEW_QUESTIONS_DIGEST_SOURCE_TYPE,
  newQuestionsDigestId,
  newQuestionsDigestTitle,
  parsePacificDay,
} from 'common/new-question-notifications'
import { log } from 'shared/utils'

// Followers hear about a creator's new public market one notification at a
// time for the first NEW_QUESTION_NOTIFICATIONS_PER_CREATOR_PER_DAY markets
// the creator makes on a Pacific day, then get one digest notification for
// the rest of that day (common/src/new-question-notifications.ts). Mentioned
// users get their own notification either way.
export const createNewContractNotification = async (
  contractCreator: User,
  contract: Contract,
  idempotencyKey: string,
  text: string,
  mentionedUserIds: string[]
) => {
  const pg = createSupabaseDirectClient()
  const notifyFollowers = contract.visibility == 'public'

  let mode: NewQuestionNotificationMode = 'skip'
  let digestId: string | null = null
  let digestDay: string | null = null
  if (notifyFollowers && !NEW_QUESTION_DIGEST_ENABLED) {
    mode = 'individual'
  } else if (notifyFollowers) {
    // Every market the creator made on this market's Pacific day, whatever
    // its visibility now (deleted ones too): created_time and creator_id
    // never change and markets are never removed, so the count never goes
    // down. It runs after this market's insert committed, so the k-th
    // notification to run sees at least k markets, and at most
    // NEW_QUESTION_NOTIFICATIONS_PER_CREATOR_PER_DAY ever go out one by one.
    try {
      const row = await pg.oneOrNone<{ day: string; markets_that_day: number }>(
        `select (c.created_time at time zone 'America/Los_Angeles')::date::text as day,
           (select count(*)::int from contracts c2
             where c2.creator_id = c.creator_id
               and c2.created_time >= (date_trunc('day', c.created_time at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles')
               and c2.created_time < ((date_trunc('day', c.created_time at time zone 'America/Los_Angeles') + interval '1 day') at time zone 'America/Los_Angeles')
           ) as markets_that_day
         from contracts c
         where c.id = $1`,
        [contract.id]
      )
      mode = getNewQuestionNotificationMode(
        row ? Number(row.markets_that_day) : undefined
      )
      if (mode === 'digest') {
        if (row && parsePacificDay(row.day)) {
          digestDay = row.day
          digestId = newQuestionsDigestId(contractCreator.id, row.day)
        } else mode = 'skip'
      }
    } catch (error) {
      log.error(
        `New-question notifications: counting ${contractCreator.id}'s markets failed`,
        { error, contractId: contract.id }
      )
      mode = 'skip'
    }
    if (mode === 'skip')
      log.error(
        `New-question notifications: not notifying followers of ${contract.id} (no usable day count)`
      )
  }

  // Followers to notify. For a digest, only those without today's digest
  // row yet (followed since, or changed their settings), looked up with both
  // key columns.
  const followers =
    mode === 'skip'
      ? []
      : await pg.map(
          `select private_users.*, users.name from private_users
           join users on private_users.id = users.id
           where private_users.id in
             (select user_id from user_follows where follow_id = $1)
             and ($2::text is null or not exists (
               select 1 from user_notifications n
               where n.user_id = private_users.id and n.notification_id = $2
             ))`,
          [contractCreator.id, digestId],
          (r) => ({ ...convertPrivateUser(r), name: r.name as string })
        )
  // Mentioned users, looked up on their own so a follower who already has
  // the digest still hears about the mention. As before this change, only
  // followers are notified of a mention here.
  const mentioned =
    mentionedUserIds.length === 0
      ? []
      : await pg.map(
          `select private_users.*, users.name from private_users
           join users on private_users.id = users.id
           where private_users.id = any($2)
             and private_users.id in
               (select user_id from user_follows where follow_id = $1)`,
          [contractCreator.id, mentionedUserIds],
          (r) => ({ ...convertPrivateUser(r), name: r.name as string })
        )

  // Bulk creators' followers get the in-app notification but no email per market.
  const emailFollowers = !NO_NEW_MARKET_EMAIL_CREATOR_IDS.includes(
    contractCreator.id
  )
  const bulkNotifications: Notification[] = []
  const bulkEmails: EmailAndTemplateEntry[] = []

  const marketNotification = (
    userId: string,
    reason: notification_preference
  ): Notification => ({
    id: idempotencyKey,
    userId,
    reason,
    createdTime: Date.now(),
    isSeen: false,
    sourceId: contract.id,
    sourceType: 'contract',
    sourceUpdateType: 'created',
    sourceUserName: contractCreator.name,
    sourceUserUsername: contractCreator.username,
    sourceUserAvatarUrl: contractCreator.avatarUrl,
    sourceText: text,
    sourceSlug: contract.slug,
    sourceTitle: contract.question,
    sourceContractSlug: contract.slug,
    sourceContractId: contract.id,
    sourceContractTitle: contract.question,
    sourceContractCreatorUsername: contract.creatorUsername,
  })

  // Old web clients render this through the plain new-market row as
  // "<creator> asked <sourceContractTitle>", linking to sourceSlug.
  const digestNotification = (
    userId: string,
    day: string,
    id: string
  ): Notification => {
    const title = newQuestionsDigestTitle(day)
    const data: NewQuestionsDigestData = { creatorId: contractCreator.id, day }
    return {
      id,
      userId,
      reason: 'contract_from_followed_user',
      createdTime: Date.now(),
      isSeen: false,
      sourceId: contractCreator.id,
      sourceType: NEW_QUESTIONS_DIGEST_SOURCE_TYPE,
      sourceUpdateType: 'created',
      sourceUserName: contractCreator.name,
      sourceUserUsername: contractCreator.username,
      sourceUserAvatarUrl: contractCreator.avatarUrl,
      sourceText: '',
      sourceTitle: title,
      sourceContractTitle: title,
      sourceSlug: `${contractCreator.username}?tab=questions`,
      data,
    }
  }

  // As it is coded now, the tag notification usurps the new contract
  // notification for that market.
  for (const privateUser of followers) {
    if (userIsBlocked(privateUser, contractCreator.id)) continue
    const { sendToBrowser, sendToEmail } = getNotificationDestinationsForUser(
      privateUser,
      'contract_from_followed_user'
    )
    if (mode === 'digest' && digestId && digestDay) {
      if (sendToBrowser)
        bulkNotifications.push(
          digestNotification(privateUser.id, digestDay, digestId)
        )
      continue
    }
    if (mentionedUserIds.includes(privateUser.id)) continue
    if (sendToBrowser)
      bulkNotifications.push(
        marketNotification(privateUser.id, 'contract_from_followed_user')
      )
    if (sendToEmail && emailFollowers) {
      const entry = getNewFollowedMarketEmail(
        'contract_from_followed_user',
        privateUser.name,
        privateUser,
        contract
      )
      if (entry) bulkEmails.push(entry)
    }
  }
  for (const privateUser of mentioned) {
    if (userIsBlocked(privateUser, contractCreator.id)) continue
    const { sendToBrowser } = getNotificationDestinationsForUser(
      privateUser,
      'tagged_user'
    )
    if (sendToBrowser)
      bulkNotifications.push(marketNotification(privateUser.id, 'tagged_user'))
  }

  await insertNotificationsIfAbsent(bulkNotifications, pg)

  await sendBulkEmails(
    `${contractCreator.name} asked ${contract.question}`,
    'new-market-followed-user-bulk',
    bulkEmails,
    `${contractCreator.name} on Manifold <no-reply@manifold.markets>`
  )
}
