import * as functions from 'firebase-functions'
import { groupBy, uniq } from 'lodash'
import * as dayjs from 'dayjs'

import { log, revalidateStaticProps } from 'shared/utils'
import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { bulkUpdate } from 'shared/supabase/utils'
import { secrets } from 'common/secrets'
import { SEASONS } from 'common/leagues'
import { getContractBetMetrics } from 'common/calculate'

export const updateLeague = functions
  .runWith({
    memory: '1GB',
    timeoutSeconds: 540,
    secrets,
  })
  .pubsub.schedule('every 15 minutes')
  .onRun(async () => {
    await updateLeagueCore()
  })

export async function updateLeagueCore() {
  const pg = createSupabaseDirectClient()

  const season = SEASONS[SEASONS.length - 1]
  const seasonStart = dayjs('2023-04-01')
    .add(season - 1, 'month')
    .valueOf()
  const seasonEnd = dayjs('2023-04-01').add(season, 'month').valueOf()

  log('Loading users...')
  const userIds = await pg.map(
    `select id from users 
    join leagues on leagues.user_id = users.id
    where leagues.season = $1`,
    [season],
    (r) => r.id as string
  )
  log(`Loaded ${userIds.length} user ids.`)

  log('Loading bets...')
  const betData = await pg.manyOrNone<{ data: Bet }>(
    `select cb.data
    from
      contract_bets as cb
    where
      created_time > millis_to_ts($1)
      and created_time < millis_to_ts($2)
    `,
    [seasonStart, seasonEnd]
  )
  const bets = betData.map((b) => b.data)
  const betsByUserId = groupBy(bets, (b) => b.userId)
  log(`Loaded ${bets.length} bets.`)

  log('Loading contracts...')
  const contracts = await getRelevantContracts(pg, bets)
  const contractsById = Object.fromEntries(contracts.map((c) => [c.id, c]))
  log(`Loaded ${contracts.length} contracts.`)

  log('Computing metric updates...')
  const updates: { user_id: string; mana_earned: number }[] = []
  for (const userId of userIds) {
    const userBets = betsByUserId[userId] ?? []
    const betsByContract = groupBy(userBets, (b) => b.contractId)

    let manEarned = 0
    for (const [contractId, contractBets] of Object.entries(betsByContract)) {
      const contract = contractsById[contractId]
      const { profit } = getContractBetMetrics(contract, contractBets)
      manEarned += profit
    }
    updates.push({
      user_id: userId,
      mana_earned: manEarned,
    })
  }

  await bulkUpdate(pg, 'leagues' as any, 'user_id', updates)
  await revalidateStaticProps('/leagues')
  log('Done.')
}

const getRelevantContracts = async (pg: SupabaseDirectClient, bets: Bet[]) => {
  const betContractIds = uniq(bets.map((b) => b.contractId))
  return await pg.map(
    `select data from contracts where id in ($1:list)`,
    [betContractIds],
    (r) => r.data as Contract
  )
}
