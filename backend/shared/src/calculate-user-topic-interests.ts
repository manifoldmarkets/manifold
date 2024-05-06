import { createSupabaseDirectClient } from 'shared/supabase/init'
import { sum, uniq } from 'lodash'
import { DAY_MS } from 'common/util/time'
import { log } from 'shared/utils'
import { ValidatedAPIParams } from 'common/api/schema'
import { Bet } from 'common/bet'
import { FEE_START_TIME, getFeeTotal, getTakerFee } from 'common/fees'

type groupIdsToConversionScore = {
  [groupId: string]: { conversionScore: number }
}
export async function calculateUserTopicInterests(startTime?: number) {
  const startDate = new Date(startTime ?? Date.now() - DAY_MS)
  const end = new Date(startDate.valueOf() + DAY_MS).toISOString()
  const start = startDate.toISOString()
  log(`Calculating user topic interests for ${start}`)
  const pg = createSupabaseDirectClient()
  const userGroupIdsToInteractions = await pg.map(
    `
      select uci.user_id, gc.group_id, json_agg(uci.name) as interactions from user_contract_interactions uci
         join contracts c on uci.contract_id = c.id
         join group_contracts gc on c.id = gc.contract_id
           where uci.created_time > $1
           and uci.created_time < $2
      group by uci.user_id, gc.group_id`,
    [start, end],
    (row) => [row.user_id, [row.group_id, row.interactions]]
  )
  const userIdsToGroupIdInteractionWeights: {
    [userId: string]: { [groupId: string]: number }
  } = {}

  const addWeight = (userId: string, groupId: string, weight: number): void => {
    if (!userIdsToGroupIdInteractionWeights[userId]) {
      userIdsToGroupIdInteractionWeights[userId] = {}
    }
    if (!userIdsToGroupIdInteractionWeights[userId][groupId]) {
      userIdsToGroupIdInteractionWeights[userId][groupId] = 0
    }
    userIdsToGroupIdInteractionWeights[userId][groupId] += Math.abs(weight)
  }

  for (const [userId, groupIdsAndInteractions] of userGroupIdsToInteractions) {
    const [groupId, interactions] = groupIdsAndInteractions
    const weights = interactions.map(
      (
        interaction: ValidatedAPIParams<'record-contract-interaction'>['kind']
      ) => {
        switch (interaction) {
          case 'page bet':
          case 'card bet':
          case 'page repost':
            return 1
          case 'card click':
            return 0.1
          case 'promoted click':
            return 0.01
          case 'page comment':
          case 'card like':
          case 'page share':
          case 'page like':
          default:
            return 0.75
        }
      }
    )
    const weight = sum(weights)
    addWeight(userId, groupId, weight)
  }

  await pg.map(
    `
        select cb.user_id, gc.group_id, cb.data from contract_bets cb
               join contracts c on cb.contract_id = c.id
               join group_contracts gc on c.id = gc.contract_id
        where cb.created_time > $1
          and cb.created_time < $2
          and is_redemption = false
          and (amount != 0 or cb.data->>'orderAmount' != '0')
        `,
    [start, end],
    (row) => {
      const bet = row.data as Bet
      const { amount, outcome, createdTime, fees, limitProb, orderAmount } = bet
      // Simulate fees if a limit bet or created before fees were introduced
      if (limitProb || createdTime < FEE_START_TIME) {
        const prob =
          bet.shares === 0 ? limitProb : Math.abs(amount / bet.shares)
        if (prob === undefined) return
        const probForOutcome = outcome === 'YES' ? prob : 1 - prob
        const probForSale = amount < 0 ? 1 - probForOutcome : probForOutcome
        const shares = Math.abs((orderAmount ?? amount) / probForSale)
        const fees = getTakerFee(shares, probForSale)
        addWeight(row.user_id, row.group_id, fees)
      } else {
        addWeight(row.user_id, row.group_id, getFeeTotal(fees))
      }
    }
  )

  const userViewedGroupIds = await pg.map(
    `
      select uve.user_id, json_agg(gc.group_id) as group_ids from postgres.public.user_view_events uve
         join contracts c on uve.contract_id = c.id
         join group_contracts gc on c.id = gc.contract_id
         where uve.created_time > $1
          and uve.created_time < $2
      group by uve.user_id`,
    [start, end],
    (row) => [row.user_id, row.group_ids]
  )
  const userIdsToViewedGroupIds = Object.fromEntries(userViewedGroupIds)
  const allUserIds = uniq([
    ...Object.keys(userIdsToGroupIdInteractionWeights),
    ...Object.keys(userIdsToViewedGroupIds),
  ])
  log(`Writing user topic interests for ${allUserIds.length} users`)
  await Promise.all(
    allUserIds.map(async (userId) => {
      const myGroupWeights = userIdsToGroupIdInteractionWeights?.[userId] ?? {}
      const interactedGroupIds: string[] = Object.keys(myGroupWeights) ?? []
      const viewedGroupIds: string[] = userIdsToViewedGroupIds?.[userId] ?? []
      const allGroupIds = uniq([...interactedGroupIds, ...viewedGroupIds])
      const groupIdsToConversionScore = Object.fromEntries(
        allGroupIds.map((groupId) => [
          groupId,
          {
            conversionScore:
              (myGroupWeights[groupId] ?? 0) /
              (viewedGroupIds.filter((id) => id === groupId).length || 1),
          },
        ])
      ) as groupIdsToConversionScore

      if (
        Object.keys(groupIdsToConversionScore).length === 0 ||
        Object.values(groupIdsToConversionScore).some(
          (v) =>
            v.conversionScore === null ||
            v.conversionScore === undefined ||
            isNaN(v.conversionScore) ||
            v.conversionScore < 0
        )
      ) {
        log.error('Skipping conversion score writes for user: ' + userId)
      }
      await pg.none(
        `insert into user_topic_interests (user_id, group_ids_to_activity)
           values ($1, $2)`,
        [userId, groupIdsToConversionScore]
      )
    })
  )
}
