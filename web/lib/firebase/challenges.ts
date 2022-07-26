import {
  collectionGroup,
  doc,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore'
import { Challenge } from 'common/challenge'
import { customAlphabet } from 'nanoid'
import { coll, listenForValue, listenForValues } from './utils'
import { useEffect, useState } from 'react'
import { User } from 'common/user'
import { db } from './init'
import { Contract } from 'common/contract'

export const challenges = (contractId: string) =>
  coll<Challenge>(`contracts/${contractId}/challenges`)

export function getChallengeUrl(challenge: Challenge) {
  return `${location.protocol}//${location.host}/challenges/${challenge.creatorUsername}/${challenge.contractSlug}/${challenge.slug}`
}
export async function createChallenge(data: {
  creator: User
  outcome: 'YES' | 'NO' | number
  prob: number
  contract: Contract
  amount: number
  expiresTime: number | null
  message: string
}) {
  const { creator, amount, expiresTime, message, prob, contract, outcome } =
    data

  // At 100 IDs per hour, using this alphabet and 8 chars, there's a 1% chance of collision in 2 years
  // See https://zelark.github.io/nano-id-cc/
  const nanoid = customAlphabet(
    '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    8
  )
  const slug = nanoid()

  if (amount <= 0 || isNaN(amount) || !isFinite(amount)) return null

  const challenge: Challenge = {
    slug,
    creatorId: creator.id,
    creatorUsername: creator.username,
    creatorName: creator.name,
    creatorAvatarUrl: creator.avatarUrl,
    creatorAmount: amount,
    contractSlug: contract.slug,
    contractId: contract.id,
    creatorsOutcome: outcome.toString(),
    yourOutcome: outcome === 'YES' ? 'NO' : 'YES',
    creatorsOutcomeProb: prob,
    createdTime: Date.now(),
    expiresTime,
    maxUses: 1,
    acceptedByUserIds: [],
    acceptances: [],
    isResolved: false,
    message,
  }

  await setDoc(doc(challenges(contract.id), slug), challenge)
  return challenge
}

// TODO: This required an index, make sure to also set up in prod
function listUserChallenges(fromId?: string) {
  return query(
    collectionGroup(db, 'challenges'),
    where('creatorId', '==', fromId),
    orderBy('createdTime', 'desc')
  )
}

function listChallenges() {
  return query(collectionGroup(db, 'challenges'))
}

export const useAcceptedChallenges = () => {
  const [links, setLinks] = useState<Challenge[]>([])

  useEffect(() => {
    listenForValues(listChallenges(), (challenges: Challenge[]) => {
      setLinks(
        challenges
          .sort((a: Challenge, b: Challenge) => b.createdTime - a.createdTime)
          .filter((challenge) => challenge.acceptedByUserIds.length > 0)
      )
    })
  }, [])

  return links
}

export function listenForChallenge(
  slug: string,
  contractId: string,
  setLinks: (challenge: Challenge | null) => void
) {
  return listenForValue<Challenge>(doc(challenges(contractId), slug), setLinks)
}

export function useChallenge(slug: string, contractId: string | undefined) {
  const [challenge, setChallenge] = useState<Challenge | null>()
  useEffect(() => {
    if (slug && contractId) {
      listenForChallenge(slug, contractId, setChallenge)
    }
  }, [contractId, slug])
  return challenge
}

export function listenForUserChallenges(
  fromId: string | undefined,
  setLinks: (links: Challenge[]) => void
) {
  return listenForValues<Challenge>(listUserChallenges(fromId), setLinks)
}

export const useUserChallenges = (fromId: string) => {
  const [links, setLinks] = useState<Challenge[]>([])

  useEffect(() => {
    return listenForUserChallenges(fromId, setLinks)
  }, [fromId])

  return links
}
