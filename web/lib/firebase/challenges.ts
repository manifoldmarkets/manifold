import {
  collectionGroup,
  doc,
  getDoc,
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
import { ENV_CONFIG } from 'common/envs/constants'

export const challenges = (contractId: string) =>
  coll<Challenge>(`contracts/${contractId}/challenges`)

export function getChallengeUrl(challenge: Challenge) {
  return `https://${ENV_CONFIG.domain}/challenges/${challenge.creatorUsername}/${challenge.contractSlug}/${challenge.slug}`
}
export async function createChallenge(data: {
  creator: User
  outcome: 'YES' | 'NO' | number
  contract: Contract
  creatorAmount: number
  acceptorAmount: number
  expiresTime: number | null
}) {
  const {
    creator,
    creatorAmount,
    expiresTime,
    contract,
    outcome,
    acceptorAmount,
  } = data

  // At 100 IDs per hour, using this alphabet and 8 chars, there's a 1% chance of collision in 2 years
  // See https://zelark.github.io/nano-id-cc/
  const nanoid = customAlphabet(
    '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
    8
  )
  const slug = nanoid()

  if (creatorAmount <= 0 || isNaN(creatorAmount) || !isFinite(creatorAmount))
    return null

  const challenge: Challenge = {
    slug,
    creatorId: creator.id,
    creatorUsername: creator.username,
    creatorName: creator.name,
    creatorAvatarUrl: creator.avatarUrl,
    creatorAmount,
    creatorOutcome: outcome.toString(),
    creatorOutcomeProb: creatorAmount / (creatorAmount + acceptorAmount),
    acceptorOutcome: outcome === 'YES' ? 'NO' : 'YES',
    acceptorAmount,
    contractSlug: contract.slug,
    contractId: contract.id,
    contractQuestion: contract.question,
    contractCreatorUsername: contract.creatorUsername,
    createdTime: Date.now(),
    expiresTime,
    maxUses: 1,
    acceptedByUserIds: [],
    acceptances: [],
    isResolved: false,
    message: '',
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

export const useUserChallenges = (fromId?: string) => {
  const [links, setLinks] = useState<Challenge[]>([])

  useEffect(() => {
    if (fromId) return listenForUserChallenges(fromId, setLinks)
  }, [fromId])

  return links
}

export const getChallenge = async (slug: string, contractId: string) => {
  const challenge = await getDoc(doc(challenges(contractId), slug))
  return challenge.data() as Challenge
}
