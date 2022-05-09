import { collection, orderBy, query, setDoc, where } from 'firebase/firestore'
import { doc } from 'firebase/firestore'
import { Manalink } from '../../../common/manalink'
import { db } from './init'
import { customAlphabet } from 'nanoid'
import { Txn } from '../../../common/txn'
import { listenForValues } from './utils'
import { useEffect, useState } from 'react'

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
    claimedUserIds: [],
    claims: [],
  }

  const ref = doc(db, 'manalinks', slug)
  await setDoc(ref, manalink)
}

const manalinkCol = collection(db, 'manalinks')

// TODO: This required an index, make sure to also set up in prod
function listUserManalinks(fromId?: string) {
  return query(
    manalinkCol,
    where('fromId', '==', fromId),
    orderBy('createdTime', 'desc')
  )
}

export function listenForUserManalinks(
  fromId: string | undefined,
  setLinks: (links: Manalink[]) => void
) {
  return listenForValues<Manalink>(listUserManalinks(fromId), setLinks)
}

export const useUserManalinks = (fromId: string) => {
  const [links, setLinks] = useState<Manalink[]>([])

  useEffect(() => {
    return listenForUserManalinks(fromId, setLinks)
  }, [fromId])

  return links
}
