import { convertAnswer, convertContract } from 'common/supabase/contracts'
import { createSupabaseDirectClient } from './supabase/init'
import { contractColumnsToSelect, isProd, log } from './utils'
import { HOUR_MS } from 'common/util/time'
import { orderBy } from 'lodash'
import { Contract } from 'common/contract'
import { Answer } from 'common/answer'
import { PrivateUser } from 'common/user'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { createMarketMovementNotification } from './create-notification'
import { Row } from 'common/supabase/utils'
import { SupabaseDirectClient } from './supabase/init'
import { bulkInsert } from 'shared/supabase/utils'
import { removeUndefinedProps } from 'common/util/object'
import { createPushNotifications } from 'shared/create-push-notifications'
import { truncateText } from './send-unseen-notifications'
import { Notification } from 'common/notification'

const pastPeriodHoursAgoStart = 24
const TEST_USER_ID = 'AJwLWoo3xue32XIiAVrL5SyR1WB2'
const TEST_CONTRACT_IDS = `'Ll8LclSZ8C', 'Z8CqLOzRAq', '6A9gSqIzld', 'D5o5fIGpQnjANdl2DxdU'`
type ProbChange = {
  contract: Contract
  answer?: Answer
  avgBefore: number
  avgAfter: number
  currentProb: number
}
// Currently ignores indie MC contract answer probability movements
export async function sendMarketMovementNotifications(debug = false) {
  const nowPeriodHoursAgoStart = debug ? 0.1 : 2
  const probThreshold = debug ? 0.01 : 0.1
  const pg = createSupabaseDirectClient()
  const now = Date.now()
  const nowStart = now - nowPeriodHoursAgoStart * HOUR_MS
  const nowEnd = now
  // const where = `where c.id = ANY(ARRAY[${TEST_CONTRACT_IDS}])`
  const where = `
  where c.last_bet_time > now() - interval '${nowPeriodHoursAgoStart} hours'
  and c.resolution_time is null
  and c.created_time < now() - interval '${pastPeriodHoursAgoStart} hours'`
  const results = await pg.multi(
    `
    select ${contractColumnsToSelect} from contracts c ${where};
    select * from answers a
    where a.contract_id in (select id from contracts c ${where})
    and a.created_time < now() - interval '${pastPeriodHoursAgoStart} hours';
    `,
    []
  )
  const allContracts = results[0].map(convertContract)
  const sumToOneContractIds = allContracts
    .filter((c) => c.mechanism === 'cpmm-multi-1' && c.shouldAnswersSumToOne)
    .map((c) => c.id)
  const answers = results[1].map(convertAnswer)
  for (const contract of allContracts) {
    if ('answers' in contract) {
      contract.answers = answers.filter((a) => a.contractId === contract.id)
    }
  }
  log(`Loaded ${allContracts.length} contracts.`)
  log(`Loaded ${answers.length} answers.`)
  const contractIds = allContracts.map((c) => c.id)

  const pastStart = now - HOUR_MS * pastPeriodHoursAgoStart
  const pastEnd = now - HOUR_MS * nowPeriodHoursAgoStart

  // Get probabilities for both current and historical windows in parallel
  const [currentAvgProbs, pastAvgProbs] = await Promise.all([
    getAverageBetProbs(
      pg,
      nowStart,
      nowEnd,
      contractIds,
      sumToOneContractIds,
      debug
    ),
    getAverageBetProbs(
      pg,
      pastStart,
      pastEnd,
      contractIds,
      sumToOneContractIds,
      debug
    ),
  ])

  const probChanges: ProbChange[] = []

  for (const contract of allContracts) {
    if (contract.mechanism === 'cpmm-1') {
      const { id, prob } = contract
      const pastAvgProb = pastAvgProbs[id]
      // const pastAvgProb = 0.1
      if (!pastAvgProb) continue
      const currentAvgProb = currentAvgProbs[id] ?? prob
      const probChange = Math.abs(currentAvgProb - pastAvgProb)
      if (debug) {
        log(`probChange: ${probChange} for ${contract.slug} ${contract.id}`)
      }
      if (probChange >= probThreshold) {
        probChanges.push({
          contract,
          avgBefore: pastAvgProb,
          avgAfter: currentAvgProb,
          currentProb: prob,
        })
      }
    } else if (
      contract.mechanism === 'cpmm-multi-1' &&
      contract.shouldAnswersSumToOne
    ) {
      const { answers: contractAnswers } = contract
      let maxChange = probThreshold
      let maxChangedAnswer = null
      let avgBefore = 0
      let avgAfter = 0
      let currentProb = 0
      for (const answer of contractAnswers) {
        const { prob, resolutionTime } = answer
        if (resolutionTime) continue
        const key = contract.id + answer.id
        const pastAvgProb = pastAvgProbs[key]
        if (!pastAvgProb) continue
        const currentAvgProb = currentAvgProbs[key] ?? prob
        const probChange = Math.abs(currentAvgProb - pastAvgProb)
        if (probChange >= maxChange) {
          maxChange = probChange
          maxChangedAnswer = answer
          avgBefore = pastAvgProb
          avgAfter = currentAvgProb
          currentProb = prob
        }
      }

      if (maxChangedAnswer) {
        probChanges.push({
          contract,
          answer: maxChangedAnswer,
          avgBefore,
          avgAfter,
          currentProb,
        })
      }
    }
  }

  const orderedProbChanges = orderBy(
    probChanges,
    (pc) => pc.contract.importanceScore,
    'desc'
  )
  log(`There are ${orderedProbChanges.length} prob changes`)
  const topProbChanges = orderedProbChanges.slice(0, 100)
  for (const pc of topProbChanges) {
    const { contract, answer, avgBefore, avgAfter } = pc
    log(
      `${contract.slug} ${answer?.text ?? ''} has moved ${avgBefore.toFixed(
        2
      )} -> ${avgAfter.toFixed(2)}`
    )
  }

  // Create market movement notifications for interested users
  await createMarketMovementNotifications(
    pg,
    orderedProbChanges,
    nowStart,
    pastStart,
    nowPeriodHoursAgoStart,
    debug,
    probThreshold
  )
}
type UserWithContractId = PrivateUser & {
  name: string
  contractId: string
}

type MovementRecord = Omit<
  Row<'contract_movement_notifications'>,
  'id' | 'created_time'
>

async function createMarketMovementNotifications(
  pg: ReturnType<typeof createSupabaseDirectClient>,
  probChanges: ProbChange[],
  currentPeriodStart: number,
  previousPeriodStart: number,
  nowPeriodHoursAgoStart: number,
  debug: boolean,
  probThreshold: number
) {
  if (probChanges.length === 0) return

  const movementRecords: MovementRecord[] = []
  const contractIds = probChanges.map((pc) => pc.contract.id)
  const allInterestedUsers = (
    await pg.map(
      `
        SELECT DISTINCT on (u.id, cf.contract_id)
        pu.data, u.name, cf.contract_id as contract_id
        from private_users pu
         join users u on pu.id = u.id
         JOIN contract_follows cf ON cf.follow_id = u.id AND cf.contract_id = ANY($1)
        where (pu.data->'notificationPreferences'->>'market_movements')::jsonb ?| array['email', 'browser', 'mobile']
        and NOT ((pu.data->'notificationPreferences'->>'opt_out_all')::jsonb @> '["email"]'
              AND (pu.data->'notificationPreferences'->>'opt_out_all')::jsonb @> '["browser"]'
              AND (pu.data->'notificationPreferences'->>'opt_out_all')::jsonb @> '["mobile"]');
      `,
      [contractIds],
      (r) =>
        ({
          ...(r.data as PrivateUser),
          name: r.name as string,
          contractId: r.contract_id as string,
        } as UserWithContractId)
    )
  ).filter((u) => (debug && isProd() ? u.id === TEST_USER_ID : true))
  log(`Found ${allInterestedUsers.length} interested users`)

  // Get existing recent movement notifications for these contracts and users
  // to avoid sending duplicate notifications for similar probability movements
  const userIds = allInterestedUsers.map((user) => user.id)
  const results = await pg.multi(
    `
    SELECT *
    FROM contract_movement_notifications
    WHERE
      contract_id = ANY($1)
      AND user_id = ANY($2)
      AND created_time > now() - interval '${pastPeriodHoursAgoStart} hours';

    SELECT
      contract_id,
      user_id
    FROM user_contract_views
    WHERE
      contract_id = ANY($1)
      AND user_id = ANY($2)
      AND last_page_view_ts > now() - interval '${nowPeriodHoursAgoStart} hours';

    SELECT distinct on (contract_id, user_id)
      contract_id,
      user_id,
      prob_after
    FROM contract_bets
    WHERE
      contract_id = ANY($1)
      AND user_id = ANY($2)
      AND created_time > now() - interval '${pastPeriodHoursAgoStart} hours'
      order by contract_id, user_id, created_time desc;
    `,
    [contractIds, userIds]
  )

  const recentMovementNotifications = results[0] as MovementRecord[]
  const recentContractPageViews = results[1].map((r) => ({
    contractId: r.contract_id,
    userId: r.user_id,
  }))
  const recentContractBets = results[2].map((r) => ({
    contractId: r.contract_id,
    userId: r.user_id,
    probAfter: r.prob_after,
  }))

  // Collection of notification parameters for bulk processing
  const notificationParams: Array<{
    id: string
    contract: Contract
    privateUser: PrivateUser
    beforeProb: number
    afterProb: number
    beforeTime: Date
    afterTime: Date
    answer?: Answer
  }> = []
  const mobileNotificationsToSend: [
    PrivateUser,
    Notification,
    string,
    string
  ][] = []

  for (const {
    contract,
    answer,
    avgBefore,
    avgAfter,
    currentProb,
  } of probChanges) {
    const { mechanism } = contract
    // Get users who are watching this market or have shares in it
    const usersInterestedInContract = allInterestedUsers
      .filter((u) => u.contractId === contract.id)
      .filter(
        (u) =>
          !recentContractPageViews.find(
            (rpv) => rpv.contractId === contract.id && rpv.userId === u.id
          ) &&
          !recentContractBets.find(
            (rb) =>
              rb.contractId === contract.id &&
              rb.userId === u.id &&
              Math.abs(rb.probAfter - avgAfter) < probThreshold &&
              Math.abs(rb.probAfter - currentProb) < probThreshold
          )
      )

    // Create records and notifications
    for (const user of usersInterestedInContract) {
      // Check user notification preferences
      const { sendToBrowser, sendToMobile } =
        getNotificationDestinationsForUser(user, 'market_movements')

      const sumsToOne =
        mechanism === 'cpmm-multi-1' && contract.shouldAnswersSumToOne

      // Check if a similar notification has already been sent recently for the relevant destination
      const existingNotificationsForUserAndContract =
        recentMovementNotifications.filter(
          (notification) =>
            notification.user_id === user.id &&
            notification.contract_id === contract.id &&
            (sumsToOne ? true : notification.answer_id == (answer?.id ?? null))
        )

      const hasSimilarRecentNotification = (
        destination: 'browser' | 'mobile'
      ) =>
        existingNotificationsForUserAndContract.some((notification) => {
          if (notification.destination !== destination) return false
          // Only one notification per sumsToOne contract per day per destination
          if (sumsToOne) return true
          const existingDirection = notification.new_val > notification.prev_val
          const newDirection = avgAfter > avgBefore
          return existingDirection === newDirection
        })

      const protoRecord: Omit<
        MovementRecord,
        'notification_id' | 'destination'
      > = {
        contract_id: contract.id,
        answer_id: answer?.id ?? null,
        user_id: user.id,
        new_val: avgAfter,
        new_val_start_time: new Date(currentPeriodStart).toISOString(),
        prev_val: avgBefore,
        prev_val_start_time: new Date(previousPeriodStart).toISOString(),
      }

      // Handle Browser Notifications
      if (sendToBrowser && !hasSimilarRecentNotification('browser')) {
        const id = crypto.randomUUID()
        const record: MovementRecord = removeUndefinedProps({
          ...protoRecord,
          destination: 'browser',
          notification_id: id,
        })
        movementRecords.push(record)

        notificationParams.push({
          id,
          contract,
          privateUser: user,
          beforeProb: avgBefore,
          afterProb: avgAfter,
          beforeTime: new Date(previousPeriodStart),
          afterTime: new Date(currentPeriodStart),
          answer,
        })
      }

      // Handle Mobile Push Notifications
      if (sendToMobile && !hasSimilarRecentNotification('mobile')) {
        // Create record for tracking
        const record: MovementRecord = removeUndefinedProps({
          ...protoRecord,
          destination: 'mobile',
          notification_id: null, // No user_notification row needed for mobile-only
        })
        movementRecords.push(record)

        // Prepare data for createPushNotifications
        const answerText = answer?.text
        const startProb = avgBefore
        const endProb = avgAfter

        const startProbText = `${Math.round(startProb * 100)}%`
        const endProbText = `${Math.round(endProb * 100)}%`

        // Basic title/body for the notification
        const questionText = truncateText(
          contract.question,
          answerText ? 70 : 130
        )
        const answerSegment = answerText
          ? `:${truncateText(answerText, 60)}`
          : ''
        const title = 'Market movement'
        const body = `${questionText}${answerSegment}: ${startProbText} → ${endProbText}`

        const tempNotification: Notification = {
          id: crypto.randomUUID(),
          userId: user.id,
          reason: 'market_movements',
          createdTime: Date.now(),
          isSeen: false,
          sourceId: answer?.id ?? contract.id,
          sourceType: answer?.id ? 'answer' : 'contract',
          sourceContractId: contract.id,
          sourceUserName: contract.creatorName,
          sourceUserUsername: contract.creatorUsername,
          sourceUserAvatarUrl: contract.creatorAvatarUrl ?? '',
          sourceText: answerText ?? (contract.question || ''),
          sourceContractTitle: contract.question,
          sourceContractCreatorUsername: contract.creatorUsername,
          sourceContractSlug: contract.slug,
        }

        mobileNotificationsToSend.push([user, tempNotification, title, body])
      }
    }
  }

  // Insert movement records in bulk
  if (movementRecords.length > 0) {
    try {
      await bulkInsert(pg, 'contract_movement_notifications', movementRecords)
      log(
        `Added ${movementRecords.length} contract movement notification records for tracking`
      )
    } catch (e) {
      log.error(`Error adding contract movement notification records: ${e}`)
    }
  }

  // Send Browser Notifications
  if (notificationParams.length > 0) {
    try {
      log(`Sending ${notificationParams.length} browser notifications in bulk`)
      const notifications = await createMarketMovementNotification(
        notificationParams
      )
      log(`Created ${notifications.length} browser notifications`)
    } catch (e) {
      log.error(`Error creating browser notifications: ${e}`)
    }
  }

  // Send Mobile Push Notifications
  if (mobileNotificationsToSend.length > 0) {
    try {
      log(`Sending ${mobileNotificationsToSend.length} push notifications`)
      await createPushNotifications(mobileNotificationsToSend)
    } catch (e) {
      log.error(`Error sending push notifications: ${e}`)
    }
  }
}

/**
 * Gets the time-weighted average probability for markets within a specific time window.
 * Weights probabilities by how long they lasted in the window.
 */
const getAverageBetProbs = async (
  pg: SupabaseDirectClient,
  startTime: number,
  endTime: number,
  contractIds: string[],
  sumToOneContractIds: string[],
  debug: boolean
) => {
  const contractKeysToProbsMap: Record<string, number | null> = {}
  await pg.map(
    `
    WITH 
    -- Get all bets in the window plus the last bet before the window 
    all_relevant_bets AS (
      (
        -- Last bet before the window (for initial probability)
        SELECT DISTINCT ON (contract_id, answer_id)
          contract_id,
          answer_id,
          prob_after,
          created_time,
          millis_to_ts($1) as effective_end_time,
          'pre_window' as bet_position
        FROM contract_bets
        WHERE 
          created_time < millis_to_ts($1)
          AND contract_id = ANY($3)
          AND (NOT is_redemption OR contract_id = ANY($4))
        ORDER BY contract_id, answer_id, created_time DESC
      )
      UNION ALL
      (
        -- All bets within the window
        SELECT
          contract_id,
          answer_id,
          prob_after,
          created_time,
          created_time as effective_end_time,
          'in_window' as bet_position
        FROM contract_bets
        WHERE 
          created_time BETWEEN millis_to_ts($1) AND millis_to_ts($2)
          AND contract_id = ANY($3)
          AND (NOT is_redemption OR contract_id = ANY($4))
        ORDER BY contract_id, answer_id, created_time
      )
    ),
    -- Calculate the effective duration of each probability
    bets_with_duration AS (
      SELECT
        contract_id,
        answer_id,
        prob_after,
        created_time,
        bet_position,
        -- Calculate the end time for this probability (when the next bet happens or window ends)
        LEAD(created_time, 1, millis_to_ts($2)) OVER (
          PARTITION BY contract_id, answer_id 
          ORDER BY created_time
        ) as next_bet_time,
        -- Calculate how long this probability lasted within the window
        CASE
          -- For the pre-window bet, only count time from window start to next bet (if any in window)
          WHEN bet_position = 'pre_window' THEN
            EXTRACT(EPOCH FROM (
              LEAST(
                LEAD(created_time, 1, millis_to_ts($2)) OVER (PARTITION BY contract_id, answer_id ORDER BY created_time),
                millis_to_ts($2)
              ) - millis_to_ts($1)
            ))
          -- For in-window bets, count from bet time to next bet or window end
          ELSE
            EXTRACT(EPOCH FROM (
              LEAST(
                LEAD(created_time, 1, millis_to_ts($2)) OVER (PARTITION BY contract_id, answer_id ORDER BY created_time),
                millis_to_ts($2)
              ) - created_time
            ))
          END as duration_seconds
      FROM all_relevant_bets
    ),
    -- Mark records that should be included in weighted average
    filtered_bets AS (
      SELECT
        contract_id,
        answer_id,
        prob_after,
        duration_seconds,
        -- Flag records with positive duration and either in-window or pre-window with influence
        CASE
          WHEN duration_seconds > 0 THEN true
          ELSE false
        END as include_in_avg
      FROM bets_with_duration
    ),
    -- Calculate weighted average for each contract/answer
    weighted_averages AS (
      SELECT
        contract_id,
        answer_id,
        SUM(prob_after * duration_seconds) as weighted_sum,
        SUM(duration_seconds) as total_duration,
        -- If we have duration data, calculate weighted average
        CASE 
          WHEN SUM(duration_seconds) > 0 THEN 
            SUM(prob_after * duration_seconds) / SUM(duration_seconds)
          ELSE 
            -- Fallback if no duration (shouldn't happen but just in case)
            AVG(prob_after) 
        END as weighted_avg_prob,
        -- Include the total duration for debugging/filtering
        COUNT(*) as bet_count
      FROM filtered_bets
      WHERE include_in_avg = true
      GROUP BY contract_id, answer_id
    ),
    -- Get the most recent bet before the window as a fallback if nothing was found
    fallback_probs AS (
      SELECT DISTINCT ON (contract_id, answer_id)
        contract_id,
        answer_id,
        prob_after as prob
      FROM contract_bets
      WHERE 
        created_time < millis_to_ts($1)
        AND contract_id = ANY($3)
        AND (NOT is_redemption OR contract_id = ANY($4))
      ORDER BY contract_id, answer_id, created_time DESC
    )
    -- Combine results, preferring weighted averages when available
    SELECT
      COALESCE(w.contract_id, f.contract_id) as contract_id,
      COALESCE(w.answer_id, f.answer_id) as answer_id,
      w.weighted_sum,
      w.total_duration,
      w.bet_count,
      w.weighted_avg_prob as prob,
      f.prob as fallback_prob
    FROM weighted_averages w
    FULL OUTER JOIN fallback_probs f
      ON w.contract_id = f.contract_id AND w.answer_id = f.answer_id
    WHERE COALESCE(w.weighted_avg_prob, f.prob) IS NOT NULL
    `,
    [startTime, endTime, contractIds, sumToOneContractIds],
    (r) => {
      const contractKey = r.contract_id + (r.answer_id ?? '')
      const weightedAvg = r.prob !== null ? parseFloat(r.prob) : null
      if (debug) {
        log(
          `DEBUG: ${contractKey} weighted avg: ${weightedAvg}, fallback: ${r.fallback_prob}`
        )
      }
      const fallbackProb =
        r.fallback_prob !== null ? parseFloat(r.fallback_prob) : null

      // Query returns weighted prob and fallback as separate rows
      if (fallbackProb && !contractKeysToProbsMap[contractKey]) {
        contractKeysToProbsMap[contractKey] = fallbackProb
      } else if (weightedAvg) {
        contractKeysToProbsMap[contractKey] = weightedAvg
      }
    }
  )

  return contractKeysToProbsMap
}
