import { setDoc } from 'firebase/firestore'
import { doc } from 'firebase/firestore'
import { Manalink } from '../../../common/manalink'
import { db } from './init'
import { customAlphabet } from 'nanoid'

export async function createManalink(data: {
  fromId: string
  amount: number
  expiresTime: number
  maxUses: number
}) {
  const { fromId, amount, expiresTime, maxUses } = data

  // At 100 IDs per hour, using this alphabet and 8 chars, there's a 1% chance of collision in 2 years
  // See https://zelark.github.io/nano-id-cc/
  const nanoid = customAlphabet(
    '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    8
  )
  const slug = nanoid()

  if (amount <= 0 || isNaN(amount) || !isFinite(amount))
    return { status: 'error', message: 'Invalid amount' }

  const manalink: Manalink = {
    slug,
    fromId,
    amount,
    token: 'M$',
    createdTime: Date.now(),
    expiresTime,
    maxUses,
    successUserIds: [],
    successes: [],
    failures: [],
  }

  const ref = doc(db, 'manalinks', slug)
  await setDoc(ref, manalink)
}
