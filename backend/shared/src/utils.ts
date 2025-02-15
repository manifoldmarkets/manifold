import { generateJSON } from '@tiptap/html'
import { APIError, getCloudRunServiceUrl } from 'common/api/utils'
import {
  Contract,
  nativeContractColumnsArray,
  contractPath,
  MarketContract,
} from 'common/contract'
import { PrivateUser } from 'common/user'
import { extensions } from 'common/util/parse'
import * as admin from 'firebase-admin'
import { first, uniq } from 'lodash'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import {
  ENV_CONFIG,
  GROUP_SLUGS_TO_IGNORE_IN_MARKETS_EMAIL,
} from 'common/envs/constants'
import { convertPrivateUser, convertUser } from 'common/supabase/users'
import { convertAnswer, convertContract } from 'common/supabase/contracts'
import { Row, tsToMillis } from 'common/supabase/utils'
import { log } from 'shared/monitoring/log'
import { metrics } from 'shared/monitoring/metrics'
import { convertLiquidity } from 'common/supabase/liquidity'
import { ContractMetric } from 'common/contract-metric'
export { metrics }
export { log }
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(timezone)

export const logMemory = () => {
  const used = process.memoryUsage()
  for (const [k, v] of Object.entries(used)) {
    log(`${k} ${Math.round((v / 1024 / 1024) * 100) / 100} MB`)
  }
}

export function htmlToRichText(html: string) {
  return generateJSON(html, extensions)
}

export const invokeFunction = async (name: string, body?: unknown) => {
  const response = await fetch(getCloudRunServiceUrl(name), {
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  })

  const json = await response.json()
  if (response.ok) {
    return json
  } else {
    throw new Error(
      `${response.status} invoking ${name}: ${JSON.stringify(json)}`
    )
  }
}

export const revalidateStaticProps = async (
  // Path after domain: e.g. "/JamesGrugett/will-pete-buttigieg-ever-be-us-pres"
  pathToRevalidate: string
) => {
  if (isProd()) {
    const apiSecret = process.env.API_SECRET as string
    if (!apiSecret)
      throw new Error('Revalidation failed because of missing API_SECRET.')

    const queryStr = `?pathToRevalidate=${pathToRevalidate}&apiSecret=${apiSecret}`
    const resp = await fetch(
      `https://${ENV_CONFIG.domain}/api/v0/revalidate` + queryStr
    )

    if (resp.ok) {
      // metrics.inc('vercel/revalidations_succeeded', { path: pathToRevalidate })
      log('Revalidated', pathToRevalidate)
    } else {
      // metrics.inc('vercel/revalidations_failed', { path: pathToRevalidate })
      try {
        const json = await resp.json()
        log.error(
          `HTTP ${
            resp.status
          } revalidating ${pathToRevalidate}: ${JSON.stringify(json)}`
        )
      } catch (e) {
        const error = e as Error
        log.error(`failed to parse response: ${error.message ?? error}`)
        log.error(`HTTP ${resp.status} revalidating ${pathToRevalidate}`)
      }
    }
  }
}

export async function revalidateContractStaticProps(contract: Contract) {
  await Promise.all([
    revalidateStaticProps(contractPath(contract)),
    revalidateStaticProps(`/embed${contractPath(contract)}`),
  ])
}
export const LOCAL_DEV = process.env.GOOGLE_CLOUD_PROJECT == null

// TODO: deprecate in favor of common/src/envs/is-prod.ts
export const isProd = () => {
  // ian: The first clause is for the API server, and the
  // second clause is for local scripts and cloud functions
  if (process.env.NEXT_PUBLIC_FIREBASE_ENV) {
    return process.env.NEXT_PUBLIC_FIREBASE_ENV === 'PROD'
  } else {
    return admin.app().options.projectId === 'mantic-markets'
  }
}

export const contractColumnsToSelect = nativeContractColumnsArray.join(',')
export const prefixedContractColumnsToSelect = nativeContractColumnsArray
  .map((col) => `c.${col}`)
  .join(',')

export const getContract = async (
  pg: SupabaseDirectClient,
  contractId: string
) => {
  const res = await pg.multi(
    `select ${contractColumnsToSelect} from contracts where id = $1 limit 1;
     select * from answers where contract_id = $1 order by index;`,
    [contractId]
  )
  const contract = first(res[0].map(convertContract))
  const answers = res[1].map(convertAnswer)
  if (contract && 'answers' in contract) {
    contract.answers = answers
  }
  return contract
}

export const getContractAndMetricsAndLiquidities = async (
  pg: SupabaseTransaction,
  unresolvedContract: MarketContract,
  answerId: string | undefined
) => {
  const { id: contractId, mechanism, outcomeType } = unresolvedContract
  const isMulti = mechanism === 'cpmm-multi-1'
  // Filter out initial liquidity if set up with special liquidity per answer.
  const filterAnte =
    isMulti &&
    outcomeType !== 'NUMBER' &&
    unresolvedContract.specialLiquidityPerAnswer
  const results = await pg.multi(
    `select ${contractColumnsToSelect} from contracts where id = $1;
     select * from answers where contract_id = $1 order by index;
     select data from user_contract_metrics 
     where contract_id = $1 and
     ${isMulti ? 'answer_id is not null and' : ''}
     ($2 is null or exists (select 1 from user_contract_metrics ucm
      where ucm.contract_id = $1
      and ucm.answer_id = $2));
     select * from contract_liquidity where contract_id = $1 ${
       filterAnte ? `and data->>'answerId' = $2` : ''
     };`,
    [contractId, answerId]
  )

  const contract = first(results[0].map(convertContract)) as MarketContract
  if (!contract) throw new APIError(404, 'Contract not found')
  const answers = results[1].map(convertAnswer)
  if ('answers' in contract) {
    contract.answers = answers
  }
  // We don't get the summary metric, we recreate them from all the answer metrics
  const contractMetrics = results[2].map((row) => row.data as ContractMetric)
  const liquidities = results[3].map(convertLiquidity)

  return { contract, contractMetrics, liquidities }
}

export const getContractSupabase = async (contractId: string) => {
  const pg = createSupabaseDirectClient()
  return await getContract(pg, contractId)
}

export const getContractFromSlugSupabase = async (contractSlug: string) => {
  const pg = createSupabaseDirectClient()
  const res = await pg.map(
    `select ${contractColumnsToSelect} from contracts where slug = $1
            limit 1`,
    [contractSlug],
    (row) => convertContract(row)
  )
  return first(res)
}

export const getUser = async (
  userId: string,
  pg: SupabaseDirectClient = createSupabaseDirectClient()
) => {
  return await pg.oneOrNone(
    `select * from users where id = $1 limit 1`,
    [userId],
    convertUser
  )
}
export const getUserAndPrivateUserOrThrow = async (
  userId: string,
  pg: SupabaseDirectClient = createSupabaseDirectClient()
) => {
  const rows = await pg.multi(
    `select * from users where id = $1 limit 1;
           select * from private_users where id = $1 limit 1;`,
    [userId]
  )
  const userRow = rows[0][0] as Row<'users'> | null
  const privateUserRow = rows[1][0] as Row<'private_users'> | null

  if (!userRow || !privateUserRow) {
    throw new APIError(404, 'User or private user not found.')
  }

  return {
    user: convertUser(userRow),
    privateUser: convertPrivateUser(privateUserRow),
  }
}

export const getUsers = async (
  userIds: string[],
  pg: SupabaseDirectClient = createSupabaseDirectClient()
) => {
  const res = await pg.map(
    `select * from users where id = any($1)`,
    [uniq(userIds)],
    (row) => convertUser(row)
  )
  return res
}

export const getPrivateUser = async (
  userId: string,
  pg: SupabaseDirectClient = createSupabaseDirectClient()
) => {
  return await pg.oneOrNone(
    `select * from private_users where id = $1 limit 1`,
    [userId],
    convertPrivateUser
  )
}
export const getPrivateUserSupabase = (userId: string) => {
  const pg = createSupabaseDirectClient()

  return pg.oneOrNone(
    `select data from private_users where id = $1`,
    [userId],
    (row) => (row ? (row.data as PrivateUser) : null)
  )
}

export const getPrivateUserByKey = async (
  apiKey: string,
  pg: SupabaseDirectClient = createSupabaseDirectClient()
) => {
  return await pg.oneOrNone(
    `select * from private_users where data->>'apiKey' = $1 limit 1`,
    [apiKey],
    convertPrivateUser
  )
}

export const getPrivateUsersNotSent = async (
  preference: 'trending_markets' | 'profit_loss_updates',
  limit: number,
  pg: SupabaseDirectClient
) => {
  return await pg.map(
    `select pu.data, u.name,
       u.created_time,
       coalesce(((u.data->'creatorTraders'->>'weekly')::bigint),0) as weekly_traders,
       coalesce(((u.data->>'currentBettingStreak')::bigint),0) as current_betting_streak
         from private_users pu
         join users u on pu.id = u.id
         where (pu.data->'notificationPreferences'->>'${preference}')::jsonb @> '["email"]'
         and ${
           preference === 'trending_markets'
             ? 'weekly_trending_email_sent'
             : 'weekly_portfolio_email_sent'
         } = false
         and (pu.data->'notificationPreferences'->>'opt_out_all')::jsonb <> '["email"]'
         and pu.data->>'email' is not null
         limit $1`,
    [limit],
    (row) => ({
      ...(row.data as PrivateUser),
      createdTime: tsToMillis(row.created_time as string),
      name: row.name as string,
      weeklyTraders: row.weekly_traders as number,
      currentBettingStreak: row.current_betting_streak as number,
    })
  )
}

export const getUserByUsername = async (
  username: string,
  pg: SupabaseDirectClient = createSupabaseDirectClient()
) => {
  const res = await pg.oneOrNone<Row<'users'>>(
    `select * from users where username = $1`,
    username
  )
  return res ? convertUser(res) : null
}

export function contractUrl(contract: Contract) {
  return `https://manifold.markets${contractPath(contract)}`
}

export async function getTrendingContractsToEmail() {
  const pg = createSupabaseDirectClient()
  return await pg.map(
    `select data from contracts
            where resolution_time is null
              and visibility = 'public'
              and not (group_slugs && $1)
              and question not ilike '%stock%'
              and question not ilike '%permanent%'
              and ((close_time > current_date + interval '1 day') or close_time is null)
              order by importance_score desc limit 25;`,
    [GROUP_SLUGS_TO_IGNORE_IN_MARKETS_EMAIL],
    (r) => r.data as Contract
  )
}

export const getBettingStreakResetTimeBeforeNow = () => {
  // Get current time in Pacific
  const now = dayjs().tz('America/Los_Angeles')

  // Get today's reset time (midnight Pacific)
  const todayResetTime = now.startOf('day')

  // Get yesterday's reset time
  const yesterdayResetTime = todayResetTime.subtract(1, 'day')

  // Use yesterday's reset time if we haven't hit today's yet
  const resetTime = (
    now.isBefore(todayResetTime) ? yesterdayResetTime : todayResetTime
  ).valueOf()
  log('betting streak reset time', resetTime)
  return resetTime
}
