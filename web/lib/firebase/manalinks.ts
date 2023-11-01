import { setDoc } from 'firebase/firestore'
import { doc } from 'firebase/firestore'
import { Manalink } from 'common/manalink'
import { customAlphabet } from 'nanoid'
import { coll } from './utils'

export const manalinks = coll<Manalink>('manalinks')

export async function createManalink(data: {
  fromId: string
  amount: number
  expiresTime: number | null
  maxUses: number | null
  message: string
}) {
  const { fromId, amount, expiresTime, maxUses, message } = data

  // At 100 IDs per hour, using this alphabet and 8 chars, there's a 1% chance of collision in 2 years
  // See https://zelark.github.io/nano-id-cc/
  const nanoid = customAlphabet(
    '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    8
  )
  const slug = nanoid()

  if (amount <= 0 || isNaN(amount) || !isFinite(amount)) return null

  const manalink: Manalink = {
    slug,
    fromId,
    amount,
    token: 'M$',
    createdTime: Date.now(),
    expiresTime,
    maxUses,
    claimedUserIds: [],
    claims: [],
    message,
  }

  await setDoc(doc(manalinks, slug), manalink)
  return slug
}
