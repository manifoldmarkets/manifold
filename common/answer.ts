import { User } from './user'

export type Answer = {
  id: string
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
    id: 'NONE',
    contractId,
    createdTime: Date.now(),
    userId: creator.id,
    username,
    name,
    avatarUrl,
    text: 'None',
  }
}
