import { convertAnswer, convertContract } from 'common/supabase/contracts'
import { createSupabaseDirectClient } from './supabase/init'
import { contractColumnsToSelect, log } from './utils'
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

const probThreshold = 0.1
const pastPeriodHoursAgoStart = 24
const nowPeriodHoursAgoStart = 2
const TEST_USER_ID = 'AJwLWoo3xue32XIiAVrL5SyR1WB2'

export async function sendContractMovementNotifications(debug = false) {
  const pg = createSupabaseDirectClient()
  const now = Date.now()
  const nowStart = now - nowPeriodHoursAgoStart * HOUR_MS
  const nowEnd = now
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
  log(`Loaded ${allContracts.length} contracts.`)
  log(`Loaded ${answers.length} answers.`)
  const contractIds = allContracts.map((c) => c.id)

  const pastStart = now - HOUR_MS * pastPeriodHoursAgoStart
  const pastEnd = now - HOUR_MS * nowPeriodHoursAgoStart

  // Get probabilities for both current and historical windows in parallel
  const [currentTimeProbs, timeAgoProbs] = await Promise.all([
    getAverageBetProbs(pg, nowStart, nowEnd, contractIds, sumToOneContractIds),
    getAverageBetProbs(
      pg,
      pastStart,
      pastEnd,
      contractIds,
      sumToOneContractIds
    ),
  ])

  const probChanges: {
    contract: Contract
    answer?: Answer
    before: number
    after: number
  }[] = []

  for (const contract of allContracts) {
    if (contract.mechanism === 'cpmm-1') {
      // For binary contracts, just push as before
      const { id, prob } = contract
      const timeAgoProb = timeAgoProbs[id]
      if (!timeAgoProb) continue
      const currentProb = currentTimeProbs[id] ?? prob
      const probChange = Math.abs(currentProb - timeAgoProb)
      if (probChange > probThreshold) {
        probChanges.push({
          contract,
          before: timeAgoProb,
          after: currentProb,
        })
      }
    } else if (
      contract.mechanism === 'cpmm-multi-1' &&
      contract.shouldAnswersSumToOne
    ) {
      // For multi-choice contracts, find the answer with the largest change
      const contractAnswers = answers.filter(
        (a) => a.contractId === contract.id
      )

      let maxChange = probThreshold
      let maxChangedAnswer = null
      let before = 0
      let after = 0

      for (const answer of contractAnswers) {
        const { prob, resolutionTime } = answer
        if (resolutionTime) continue
        const key = contract.id + answer.id
        const timeAgoProb = timeAgoProbs[key]
        if (!timeAgoProb) continue
        const currentProb = currentTimeProbs[key] ?? prob
        const probChange = Math.abs(currentProb - timeAgoProb)

        if (probChange > maxChange) {
          maxChange = probChange
          maxChangedAnswer = answer
          before = timeAgoProb
          after = currentProb
        }
      }

      if (maxChangedAnswer) {
        probChanges.push({
          contract,
          answer: maxChangedAnswer,
          before,
          after,
        })
      }
    }
  }

  const orderedProbChanges = orderBy(
    probChanges,
    (pc) => pc.contract.importanceScore,
    'desc'
  )
  console.log(`There are ${orderedProbChanges.length} prob changes`)
  const topProbChanges = orderedProbChanges.slice(0, 100)
  for (const pc of topProbChanges) {
    const { contract, answer, before, after } = pc
    console.log(
      `${contract.slug} ${answer?.text ?? ''} has moved ${before.toFixed(
        2
      )} -> ${after.toFixed(2)}`
    )
  }

  // Create market movement notifications for interested users
  await createMarketMovementNotifications(
    pg,
    orderedProbChanges,
    now,
    pastStart,
    debug
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
  probChanges: {
    contract: Contract
    answer?: Answer
    before: number
    after: number
  }[],
  now: number,
  timeAgo: number,
  debug = false
) {
  if (probChanges.length === 0) return

  // Store contract_movement_notifications records for bulk insert
  const movementRecords: MovementRecord[] = []
  const contractIds = probChanges.map((pc) => pc.contract.id)
  // TODO: fix this query, only checks for email notification preferences
  const allInterestedUsers = (
    await pg.map(
      `
        SELECT DISTINCT on (u.id, coalesce(cf.contract_id, ucm.contract_id, c.id))
        pu.data, u.name, coalesce(cf.contract_id, ucm.contract_id, c.id) as contract_id
        from private_users pu
         join users u on pu.id = u.id
         LEFT JOIN contract_follows cf ON cf.follow_id = u.id AND cf.contract_id = ANY($1)
         LEFT JOIN user_contract_metrics ucm ON ucm.user_id = u.id AND ucm.contract_id = ANY($1)
         left join contracts c on c.creator_id = u.id and c.id = ANY($1)
        where (pu.data->'notificationPreferences'->>'market_movements')::jsonb ?| array['email', 'browser', 'mobile']
        and NOT ((pu.data->'notificationPreferences'->>'opt_out_all')::jsonb @> '["email"]'
              AND (pu.data->'notificationPreferences'->>'opt_out_all')::jsonb @> '["browser"]'
              AND (pu.data->'notificationPreferences'->>'opt_out_all')::jsonb @> '["mobile"]')
        and pu.data->>'email' is not null
        and (cf.contract_id IS NOT NULL OR (ucm.contract_id is not null and ucm.has_shares)
        or c.creator_id = u.id);
      `,
      [contractIds],
      (r) =>
        ({
          ...(r.data as PrivateUser),
          name: r.name as string,
          contractId: r.contract_id as string,
        } as UserWithContractId)
    )
  ).filter((u) => (debug ? u.id === TEST_USER_ID : true))
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
    
    SELECT distinct
      contract_id,
      user_id
    FROM contract_bets
    WHERE 
      contract_id = ANY($1) 
      AND user_id = ANY($2)
      AND created_time > now() - interval '${nowPeriodHoursAgoStart} hours';
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
  }))

  // Collection of notification parameters for bulk processing
  const notificationParams: Array<{
    contract: Contract
    privateUser: PrivateUser
    beforeProb: number
    afterProb: number
    beforeTime: Date
    afterTime: Date
    answer?: Answer
  }> = []

  for (const { contract, answer, before, after } of probChanges) {
    // Get users who are watching this market or have shares in it
    const usersInterestedInContract = allInterestedUsers
      .filter((u) => u.contractId === contract.id)
      .filter(
        (u) =>
          !recentContractPageViews.find(
            (rpv) => rpv.contractId === contract.id && rpv.userId === u.id
          ) &&
          !recentContractBets.find(
            (rb) => rb.contractId === contract.id && rb.userId === u.id
          )
      )
    log(
      `Found ${usersInterestedInContract.length} interested users for contract ${contract.slug}`
    )

    // Create records and notifications
    for (const user of usersInterestedInContract) {
      // Check user notification preferences
      const { sendToBrowser } = getNotificationDestinationsForUser(
        user,
        'market_movements'
      )

      if (!sendToBrowser) continue

      // Check if a similar notification has already been sent
      const existingNotifications = recentMovementNotifications.filter(
        (notification) =>
          notification.user_id === user.id &&
          notification.contract_id === contract.id &&
          notification.answer_id == (answer?.id ?? null)
      )

      // Skip if we have a similar notification already
      // We consider a notification similar if:
      // 1. It's for the same user, contract, and answer
      // 2. The probability movement is in the same direction (both increasing or both decreasing)
      // 3. The probability movement is of similar magnitude (within 0.1)
      const skipNotification = existingNotifications.some((notification) => {
        const existingDirection = notification.val_end > notification.val_start
        const newDirection = after > before
        const similarDirection = existingDirection === newDirection

        const existingMagnitude = Math.abs(
          notification.val_end - notification.val_start
        )
        const newMagnitude = Math.abs(after - before)
        const similarMagnitude =
          Math.abs(existingMagnitude - newMagnitude) < 0.1

        return similarDirection && similarMagnitude
      })

      if (skipNotification) {
        continue
      }

      // Create notifications directly while also creating the records for tracking
      try {
        // Create the records to track which notifications have been sent
        const destinations = []
        if (sendToBrowser) destinations.push('app')

        for (const destination of destinations) {
          const record: MovementRecord = {
            contract_id: contract.id,
            answer_id: answer?.id ?? null,
            user_id: user.id,
            val_start: before,
            val_end: after,
            val_start_time: new Date(timeAgo).toISOString(),
            val_end_time: new Date(now).toISOString(),
            destination,
          }
          movementRecords.push(record)
        }
        log(
          `Created ${destinations.length} movement records for contract ${contract.slug} and user ${user.id}`
        )

        // If browser notifications are enabled, collect the notification parameters for bulk processing
        if (sendToBrowser) {
          notificationParams.push({
            contract,
            privateUser: user,
            beforeProb: before,
            afterProb: after,
            beforeTime: new Date(timeAgo),
            afterTime: new Date(now),
            answer,
          })
        }
      } catch (e) {
        log.error(`Error creating notification for user ${user.id}: ${e}`)
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
      if (notificationParams.length > 0) {
        log(`Sending ${notificationParams.length} notifications in bulk`)
        const notifications = await createMarketMovementNotification(
          notificationParams
        )
        log(`Created ${notifications.length} notifications`)
      }
    } catch (e) {
      log.error(`Error adding contract movement notification records: ${e}`)
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
  sumToOneContractIds: string[]
) => {
  return Object.fromEntries(
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
            millis_to_ts($1) as effective_end_time,  -- It's effective until the window starts
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
            created_time as effective_end_time, -- Will be overwritten in next step
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
            WHEN duration_seconds > 0 AND bet_position = 'in_window' THEN true
            WHEN duration_seconds > 0 AND bet_position = 'pre_window' THEN true
            ELSE false
          END as include_in_avg
        FROM bets_with_duration
      ),
      -- Calculate weighted average for each contract/answer
      weighted_averages AS (
        SELECT
          contract_id,
          answer_id,
          -- If we have duration data, calculate weighted average
          CASE 
            WHEN SUM(duration_seconds) > 0 THEN 
              SUM(prob_after * duration_seconds) / SUM(duration_seconds)
            ELSE 
              -- Fallback if no duration (shouldn't happen but just in case)
              AVG(prob_after) 
          END as weighted_avg_prob,
          -- Include the total duration for debugging/filtering
          SUM(duration_seconds) as total_seconds,
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
        COALESCE(w.weighted_avg_prob, f.prob) as prob
      FROM weighted_averages w
      FULL OUTER JOIN fallback_probs f
        ON w.contract_id = f.contract_id AND w.answer_id = f.answer_id
      WHERE COALESCE(w.weighted_avg_prob, f.prob) IS NOT NULL
      `,
      [startTime, endTime, contractIds, sumToOneContractIds],
      (r) => [r.contract_id + (r.answer_id ?? ''), parseFloat(r.prob as string)]
    )
  )
}
