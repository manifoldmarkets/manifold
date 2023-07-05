import { generateJSON } from '@tiptap/html'
import { getCloudRunServiceUrl } from 'common/api'
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
import { chunk, groupBy, mapValues, sumBy } from 'lodash'
import { BETTING_STREAK_RESET_HOUR } from 'common/economy'
import { DAY_MS } from 'common/util/time'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const log = (...args: unknown[]) => {
  console.log(`[${new Date().toISOString()}]`, ...args)
}

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
    const { ok, status, statusText } = await fetch(
      'https://manifold.markets/api/v0/revalidate' + queryStr
    )
    if (!ok)
      throw new Error(
        'Error revalidating: ' + queryStr + ': ' + status + ' ' + statusText
      )

    console.log('Revalidated', pathToRevalidate)
  }
}

export type UpdateSpec = {
  doc: admin.firestore.DocumentReference
  fields: { [k: string]: unknown }
}

export const writeAsync = async (
  db: admin.firestore.Firestore,
  updates: UpdateSpec[],
  operationType: 'update' | 'set' = 'update',
  batchSize = 500 // 500 = Firestore batch limit
) => {
  const chunks = chunk(updates, batchSize)
  for (let i = 0; i < chunks.length; i++) {
    log(`${i * batchSize}/${updates.length} updates written...`)
    const batch = db.batch()
    for (const { doc, fields } of chunks[i]) {
      if (operationType === 'update') {
        batch.update(doc, fields as any)
      } else {
        batch.set(doc, fields)
      }
    }
    await batch.commit()
  }
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

export const getUser = (userId: string) => {
  return getDoc<User>('users', userId)
}

export const getPrivateUser = (userId: string) => {
  return getDoc<PrivateUser>('private-users', userId)
}

export const getAllPrivateUsers = async () => {
  const firestore = admin.firestore()
  const users = await firestore.collection('private-users').get()
  return users.docs.map((doc) => doc.data() as PrivateUser)
}

export const getAllUsers = async () => {
  const firestore = admin.firestore()
  const users = await firestore.collection('users').get()
  return users.docs.map((doc) => doc.data() as User)
}

export const getUserByUsername = async (username: string) => {
  const firestore = admin.firestore()
  const snap = await firestore
    .collection('users')
    .where('username', '==', username)
    .get()

  return snap.empty ? undefined : (snap.docs[0].data() as User)
}

const updateUserBalance = (
  transaction: Transaction,
  userId: string,
  balanceDelta: number,
  depositDelta: number
) => {
  const firestore = admin.firestore()
  const userDoc = firestore.doc(`users/${userId}`)

  // Note: Balance is allowed to go negative.
  transaction.update(userDoc, {
    balance: FieldValue.increment(balanceDelta),
    totalDeposits: FieldValue.increment(depositDelta),
  })
}

export const payUser = (userId: string, payout: number, isDeposit = false) => {
  if (!isFinite(payout)) throw new Error('Payout is not finite: ' + payout)

  const firestore = admin.firestore()
  return firestore.runTransaction(async (transaction) => {
    updateUserBalance(transaction, userId, payout, isDeposit ? payout : 0)
  })
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

// Max 500 users in one transaction.
export const payUsers = (
  transaction: Transaction,
  payouts: {
    userId: string
    payout: number
    deposit?: number
  }[]
) => {
  const mergedPayouts = checkAndMergePayouts(payouts)
  for (const { userId, payout, deposit } of mergedPayouts) {
    updateUserBalance(transaction, userId, payout, deposit)
  }
}

export function contractUrl(contract: Contract) {
  return `https://manifold.markets${contractPath(contract)}`
}

export async function getTrendingContracts() {
  const pg = createSupabaseDirectClient()
  return await pg.map(
    `select data from contracts 
            where resolution_time is null 
              and visibility = 'public'
              order by importance_score desc limit 500;`,
    [],
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
