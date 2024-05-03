import { generateJSON } from '@tiptap/html'
import { getCloudRunServiceUrl } from 'common//api/utils'
import { Contract, contractPath } from 'common/contract'
import { PrivateUser, User } from 'common/user'
import { extensions } from 'common/util/parse'
import * as admin from 'firebase-admin'
import {
  CollectionGroup,
  CollectionReference,
  DocumentData,
  FieldValue,
  Query,
  QueryDocumentSnapshot,
  QuerySnapshot,
  Transaction,
} from 'firebase-admin/firestore'
import { first, groupBy, mapValues, sumBy } from 'lodash'
import { BETTING_STREAK_RESET_HOUR } from 'common/economy'
import { DAY_MS } from 'common/util/time'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import {
  ENV_CONFIG,
  GROUP_SLUGS_TO_IGNORE_IN_MARKETS_EMAIL,
} from 'common/envs/constants'
import { convertUser } from 'common/supabase/users'
import { convertContract } from 'common/supabase/contracts'
import { Row } from 'common/supabase/utils'
import { SafeBulkWriter } from 'shared/safe-bulk-writer'
import { log, Logger } from 'shared/monitoring/log'
import { metrics } from 'shared/monitoring/metrics'

export { metrics }
export { log, Logger }

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
      metrics.inc('vercel/revalidations_succeeded', { path: pathToRevalidate })
      log('Revalidated', pathToRevalidate)
    } else {
      metrics.inc('vercel/revalidations_failed', { path: pathToRevalidate })
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

export type UpdateSpec = {
  doc: admin.firestore.DocumentReference
  fields: { [k: string]: unknown }
}

export const writeAsync = async (
  db: admin.firestore.Firestore,
  updates: UpdateSpec[],
  operationType: 'update' | 'set' = 'update'
) => {
  const writer = new SafeBulkWriter(undefined, db)
  for (const update of updates) {
    const { doc, fields } = update
    if (operationType === 'update') {
      writer.update(doc, fields as any)
    } else {
      writer.set(doc, fields)
    }
  }
  await writer.close()
}

export const loadPaginated = async <T extends DocumentData>(
  q: Query<T> | CollectionReference<T>,
  batchSize = 500
) => {
  const results: T[] = []
  let prev: QuerySnapshot<T> | undefined
  for (let i = 0; prev == undefined || prev.size > 0; i++) {
    prev = await (prev == undefined
      ? q.limit(batchSize)
      : q.limit(batchSize).startAfter(prev.docs[prev.size - 1])
    ).get()
    results.push(...prev.docs.map((d) => d.data() as T))
  }
  return results
}

export const processPaginated = async <T extends DocumentData, U>(
  q: Query<T>,
  batchSize: number,
  fn: (ts: QuerySnapshot<T>) => Promise<U>
) => {
  const results = []
  let prev: QuerySnapshot<T> | undefined
  let processed = 0
  for (let i = 0; prev == null || prev.size > 0; i++) {
    log(`Loading next page.`)
    prev = await (prev == null
      ? q.limit(batchSize)
      : q.limit(batchSize).startAfter(prev.docs[prev.size - 1])
    ).get()
    log(`Loaded ${prev.size} documents.`)
    processed += prev.size
    results.push(await fn(prev))
    log(`Processed ${prev.size} documents. Total: ${processed}`)
  }
  return results
}

export const processPartitioned = async <T extends DocumentData, U>(
  group: CollectionGroup<T>,
  partitions: number,
  fn: (ts: QueryDocumentSnapshot<T>[]) => Promise<U>
) => {
  const logProgress = (i: number, msg: string) => {
    log(`[${i + 1}/~${partitions}] ${msg}`)
  }
  const parts = group.getPartitions(partitions)
  const results: U[] = []
  let i = 0
  let docsProcessed = 0
  let currentlyProcessing: { i: number; n: number; job: Promise<U> } | undefined
  for await (const part of parts) {
    logProgress(i, 'Loading partition.')
    const ts = await part.toQuery().get()
    logProgress(i, `Loaded ${ts.size} documents.`)
    if (currentlyProcessing != null) {
      results.push(await currentlyProcessing.job)
      docsProcessed += currentlyProcessing.n
      logProgress(
        currentlyProcessing.i,
        `Processed ${currentlyProcessing.n} documents: Total: ${docsProcessed}`
      )
    }
    logProgress(i, `Processing ${ts.size} documents.`)
    currentlyProcessing = { i: i, n: ts.size, job: fn(ts.docs) }
    i++
  }
  if (currentlyProcessing != null) {
    results.push(await currentlyProcessing.job)
    docsProcessed += currentlyProcessing.n
    logProgress(
      currentlyProcessing.i,
      `Processed ${currentlyProcessing.n} documents: Total: ${docsProcessed}`
    )
  }
  return results
}

// TODO: deprecate in favor of common/src/envs/is-prod.ts
export const isProd = () => {
  // mqp: kind of hacky rn. the first clause is for cloud run API service,
  // second clause is for local scripts and cloud functions
  if (process.env.ENVIRONMENT) {
    return process.env.ENVIRONMENT == 'PROD'
  } else {
    return admin.app().options.projectId === 'mantic-markets'
  }
}

export const getDoc = async <T>(collection: string, doc: string) => {
  const snap = await admin.firestore().collection(collection).doc(doc).get()

  return snap.exists ? (snap.data() as T) : undefined
}

export const getValue = async <T>(ref: admin.firestore.DocumentReference) => {
  const snap = await ref.get()

  return snap.exists ? (snap.data() as T) : undefined
}

export const getValues = async <T>(query: admin.firestore.Query) => {
  const snap = await query.get()
  return snap.docs.map((doc) => doc.data() as T)
}

export const getContract = (contractId: string) => {
  return getDoc<Contract>('contracts', contractId)
}
export const getContractSupabase = async (contractId: string) => {
  const pg = createSupabaseDirectClient()
  const res = await pg.map(
    `select data, importance_score, conversion_score, view_count from contracts where id = $1
            limit 1`,
    [contractId],
    (row) => convertContract(row)
  )
  return first(res)
}
export const getContractFromSlugSupabase = async (contractSlug: string) => {
  const pg = createSupabaseDirectClient()
  const res = await pg.map(
    `select data, importance_score, conversion_score, view_count from contracts where slug = $1
            limit 1`,
    [contractSlug],
    (row) => convertContract(row)
  )
  return first(res)
}

export const getUserFirebase = (userId: string) => {
  return getDoc<User>('users', userId)
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

export const getUsers = async (
  userIds: string[],
  pg: SupabaseDirectClient = createSupabaseDirectClient()
) => {
  const res = await pg.map(
    `select * from users where id = any($1)`,
    [userIds],
    (row) => convertUser(row)
  )
  return res
}

export const getPrivateUser = (userId: string) => {
  return getDoc<PrivateUser>('private-users', userId)
}

export const getAllPrivateUsers = async () => {
  const firestore = admin.firestore()
  const users = await firestore.collection('private-users').get()
  return users.docs.map((doc) => doc.data() as PrivateUser)
}

export const getPrivateUsersNotSent = async (
  preference: 'trending_markets' | 'profit_loss_updates',
  limit: number,
  pg: SupabaseDirectClient
) => {
  return await pg.map(
    `select data from private_users 
         where (data->'notificationPreferences'->>'${preference}')::jsonb @> '["email"]'
         and ${
           preference === 'trending_markets'
             ? 'weekly_trending_email_sent'
             : 'weekly_portfolio_email_sent'
         } = false
         and (data->'notificationPreferences'->>'opt_out_all')::jsonb <> '["email"]'
         and data->>'email' is not null
         limit $1`,
    [limit],
    (row) => row.data as PrivateUser
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

export const checkAndMergePayouts = (
  payouts: {
    userId: string
    payout: number
    deposit?: number
  }[]
) => {
  for (const { payout, deposit } of payouts) {
    if (!isFinite(payout)) {
      throw new Error('Payout is not finite: ' + payout)
    }
    if (deposit !== undefined && !isFinite(deposit)) {
      throw new Error('Deposit is not finite: ' + deposit)
    }
  }

  const groupedPayouts = groupBy(payouts, 'userId')
  return Object.values(
    mapValues(groupedPayouts, (payouts, userId) => ({
      userId,
      payout: sumBy(payouts, 'payout'),
      deposit: sumBy(payouts, (p) => p.deposit ?? 0),
    }))
  )
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
  const now = Date.now()
  const currentDateResetTime = new Date().setUTCHours(
    BETTING_STREAK_RESET_HOUR,
    0,
    0,
    0
  )
  // if now is before reset time, use yesterday's reset time
  const lastDateResetTime = currentDateResetTime - DAY_MS
  return now < currentDateResetTime ? lastDateResetTime : currentDateResetTime
}
