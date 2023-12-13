import { BOT_USERNAMES, ENV_CONFIG, MOD_IDS } from 'common/envs/constants'
import { User } from 'common/user'
import { removeUndefinedProps } from 'common/util/object'

export type LiteUser = {
  id: string
  createdTime: number

  name: string
  username: string
  url: string
  avatarUrl?: string

  bio?: string
  website?: string
  twitterHandle?: string
  discordHandle?: string

  isBot?: boolean
  isAdmin?: boolean
  isTrustworthy?: boolean
  isBannedFromPosting?: boolean
  userDeleted?: boolean

  balance: number
  totalDeposits: number
  lastBetTime?: number
  currentBettingStreak?: number
  profitCached: {
    daily: number
    weekly: number
    monthly: number
    allTime: number
  }
}

export function toLiteUser(user: User): LiteUser {
  const {
    id,
    createdTime,
    name,
    username,
    avatarUrl,
    bio,
    website,
    twitterHandle,
    discordHandle,
    balance,
    totalDeposits,
    profitCached,
    isBannedFromPosting,
    userDeleted,
    currentBettingStreak,
    lastBetTime,
  } = user

  const isBot = BOT_USERNAMES.includes(username)
  const isAdmin = ENV_CONFIG.adminIds.includes(id)
  const isTrustworthy = MOD_IDS.includes(id)

  return removeUndefinedProps({
    id,
    createdTime,
    name,
    username,
    url: `https://${ENV_CONFIG.domain}/${username}`,
    avatarUrl,
    bio,
    website,
    twitterHandle,
    discordHandle,
    balance,
    totalDeposits,
    profitCached,
    isBot,
    isAdmin,
    isTrustworthy,
    isBannedFromPosting,
    userDeleted,
    currentBettingStreak,
    lastBetTime,
  })
}
