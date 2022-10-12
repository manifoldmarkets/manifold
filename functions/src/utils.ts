import * as admin from 'firebase-admin'
import fetch from 'node-fetch'

import { chunk } from 'lodash'
import { Contract } from '../../common/contract'
import { PrivateUser, User } from '../../common/user'
import { Group } from '../../common/group'
import { Post } from '../../common/post'

export const log = (...args: unknown[]) => {
  console.log(`[${new Date().toISOString()}]`, ...args)
}

export const logMemory = () => {
  const used = process.memoryUsage()
  for (const [k, v] of Object.entries(used)) {
    log(`${k} ${Math.round((v / 1024 / 1024) * 100) / 100} MB`)
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
  userId: string,
  delta: number,
  isDeposit = false
) => {
  const firestore = admin.firestore()
  return firestore.runTransaction(async (transaction) => {
    const userDoc = firestore.doc(`users/${userId}`)
    const userSnap = await transaction.get(userDoc)
    if (!userSnap.exists) return
    const user = userSnap.data() as User

    const newUserBalance = user.balance + delta

    // if (newUserBalance < 0)
    //   throw new Error(
    //     `User (${userId}) balance cannot be negative: ${newUserBalance}`
    //   )

    if (isDeposit) {
      const newTotalDeposits = (user.totalDeposits || 0) + delta
      transaction.update(userDoc, { totalDeposits: newTotalDeposits })
    }

    transaction.update(userDoc, { balance: newUserBalance })
  })
}

export const payUser = (userId: string, payout: number, isDeposit = false) => {
  if (!isFinite(payout)) throw new Error('Payout is not finite: ' + payout)

  return updateUserBalance(userId, payout, isDeposit)
}

export const chargeUser = (
  userId: string,
  charge: number,
  isAnte?: boolean
) => {
  if (!isFinite(charge) || charge <= 0)
    throw new Error('User charge is not positive: ' + charge)

  return updateUserBalance(userId, -charge, isAnte)
}

export const getContractPath = (contract: Contract) => {
  return `/${contract.creatorUsername}/${contract.slug}`
}

export function contractUrl(contract: Contract) {
  return `https://manifold.markets/${contract.creatorUsername}/${contract.slug}`
}
