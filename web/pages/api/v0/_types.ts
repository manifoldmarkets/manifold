import {
  ENV_CONFIG,
  BOT_USERNAMES,
  CORE_USERNAMES,
  MOD_USERNAMES,
} from 'common/envs/constants'
import { User } from 'common/user'
import { removeUndefinedProps } from 'common/util/object'

export type ApiError = {
  error: string
}

type ValidationErrorDetail = {
  field: string | null
  error: string
}
export class ValidationError {
  details: ValidationErrorDetail[]

  constructor(details: ValidationErrorDetail[]) {
    this.details = details
  }
}

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

  balance: number
  totalDeposits: number

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
    followerCountCached,
    currentBettingStreak,
    lastBetTime,
  } = user

  const isBot = BOT_USERNAMES.includes(username)
  const isAdmin = CORE_USERNAMES.includes(username)
  const isTrustworthy = MOD_USERNAMES.includes(username)

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
    followerCountCached,
    currentBettingStreak,
    lastBetTime,
  })
}
