import { User } from './user'

export type Answer = {
  id: string
  index: number // Order of the answer in the list
  contractId: string
  userId: string
  text: string
  createdTime: number

  // Mechanism props
  poolYes: number // YES shares
  poolNo: number // NO shares
  prob: number // Computed from poolYes and poolNo.
  totalLiquidity: number // for historical reasons, this the total subsidy amount added in M
  subsidyPool: number // current value of subsidy pool in M
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

export const MULTIPLE_CHOICE_MAX_ANSWERS = 100