import * as admin from 'firebase-admin'
import fetch from 'node-fetch'
import {
  CollectionGroup,
  DocumentData,
  FieldValue,
  QueryDocumentSnapshot,
  Transaction,
} from 'firebase-admin/firestore'
import { chunk, groupBy, mapValues, sumBy } from 'lodash'
import { generateJSON } from '@tiptap/html'
import { stringParseExts } from '../../common/util/parse'

import { Contract } from '../../common/contract'
import { PrivateUser, User } from '../../common/user'
import { Group } from '../../common/group'
import { Post } from '../../common/post'
import { getFunctionUrl } from '../../common/api'

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
  return generateJSON(html, stringParseExts)
}

export const invokeFunction = async (name: string, body?: unknown) => {
  const response = await fetch(getFunctionUrl(name), {
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
    const queryStr = `?pathToRevalidate=${pathToRevalidate}&apiSecret=${apiSecret}`
    await fetch('https://manifold.markets/api/v0/revalidate' + queryStr)
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

export const processPartitioned = async <T extends DocumentData, U>(
  group: CollectionGroup<T>,
  partitions: number,
  fn: (ts: QueryDocumentSnapshot<T>[]) => Promise<U>
) => {
  const parts = group.getPartitions(partitions)
  const results = []
  let processed = 0
  for await (const part of parts) {
    const i = results.length
    log(`[${i + 1}/${partitions}] Loading partition.`)
    const ts = await part.toQuery().get()
    processed += ts.size
    log(`[${i + 1}/${partitions}] Loaded = ${ts.size}. Total = ${processed}.`)
    results.push(await fn(ts.docs))
  }
  return results
}

export const tryOrLogError = async <T>(task: Promise<T>) => {
  try {
    return await task
  } catch (e) {
    console.error(e)
    return null
  }
}

export const isProd = () => {
  return admin.instanceId().app.options.projectId === 'mantic-markets'
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

export const getGroup = (groupId: string) => {
  return getDoc<Group>('groups', groupId)
}

export const getPost = (postId: string) => {
  return getDoc<Post>('posts', postId)
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

const checkAndMergePayouts = (
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

export const payUsersMultipleTransactions = async (
  payouts: {
    userId: string
    payout: number
    deposit?: number
  }[]
) => {
  const firestore = admin.firestore()
  const mergedPayouts = checkAndMergePayouts(payouts)
  const payoutChunks = chunk(mergedPayouts, 500)

  for (const payoutChunk of payoutChunks) {
    await firestore.runTransaction(async (transaction) => {
      for (const { userId, payout, deposit } of payoutChunk) {
        updateUserBalance(transaction, userId, payout, deposit)
      }
    })
  }
}

export const getContractPath = (contract: Contract) => {
  return `/${contract.creatorUsername}/${contract.slug}`
}

export function contractUrl(contract: Contract) {
  return `https://manifold.markets/${contract.creatorUsername}/${contract.slug}`
}
