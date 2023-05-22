import { User } from './user'

export type DpmAnswer = {
  id: string
  contractId: string
  userId: string
  text: string
  createdTime: number

  // Mechanism props
  poolYes: number // YES shares
  poolNo: number // NO shares
  prob: number // Computed from poolYes and poolNo.
  totalSubsidy: number
  subsidyPool: number // Current value of subsidy pool in Ṁ, which will be added over time to poolYes and poolNo.
}

export type DpmAnswer = {
  id: string
  number: number
  contractId: string
  createdTime: number

  userId: string
  username: string
  name: string
  avatarUrl?: string

  text: string
}

export const getNoneAnswer = (contractId: string, creator: User) => {
  const { username, name, avatarUrl } = creator

  return {
    id: '0',
    number: 0,
    contractId,
    createdTime: Date.now(),
    userId: creator.id,
    username,
    name,
    avatarUrl,
    text: 'None',
  }
}

export const MAX_ANSWER_LENGTH = 240
