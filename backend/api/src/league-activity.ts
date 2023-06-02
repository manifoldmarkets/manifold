import { z } from 'zod'

import { authEndpoint, validate } from './helpers'
import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { getSeasonDates } from 'common/leagues'
import { uniq } from 'lodash'
import { Contract } from 'common/contract'
import { ContractComment } from 'common/comment'
import { Bet } from 'common/bet'

const bodySchema = z.object({
  season: z.number(),
  cohort: z.string(),
})

export const leagueActivity = authEndpoint(async (req) => {
  const { season, cohort } = validate(bodySchema, req.body)

  const pg = createSupabaseDirectClient()
  return await getLeagueActivity(pg, season, cohort)
})

export const getLeagueActivity = async (
  pg: SupabaseDirectClient,
  season: number,
  cohort: string
) => {
  const userIds = await pg.map(
    `select user_id from leagues
    where season = $1 and cohort = $2
  `,
    [season, cohort],
    (row: { user_id: string }) => row.user_id
  )

  const { start, end } = getSeasonDates(season)

  const bets = await pg.map<Bet>(
    `select
      cb.data
    from contract_bets cb
    where
      cb.user_id = any($1)
      and cb.created_time >= $2
      and cb.created_time < $3
    order by cb.created_time desc
    limit 10000
  `,
    [userIds, start, end],
    (row) => row.data
  )
  console.log('bets', bets.length)

  const comments = await pg.map<ContractComment>(
    `select
      cc.data
    from contract_comments cc
    where
      cc.user_id = any($1)
      and cc.created_time >= $2
      and cc.created_time < $3
    order by cc.created_time desc
    limit 1000
  `,
    [userIds, start, end],
    (row) => row.data
  )
  console.log('comments', comments.length)

  const contractIds = uniq([
    ...bets.map((b) => b.contractId),
    ...comments.map((c) => c.contractId),
  ])

  const contracts = await pg.map<Contract>(
    `select
      data from contracts
    where
      contracts.id = any($1)
      `,
    [contractIds],
    (row) => row.data
  )
  console.log('contracts', contracts.length)

  return {
    bets: bets.filter((bet) => bet.visibility === 'public'),
    comments: comments.filter((comment) => comment.visibility === 'public'),
    contracts: contracts.filter((contract) => contract.visibility === 'public'),
  }
}
