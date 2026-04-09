import {
  DOMAIN_SUFFIX_REGEX,
  GAMBLING_BRAND_NAMES,
  GAMBLING_REGEXES,
  normalizeSpamText,
  URL_REGEX,
  VIETNAMESE_GAMBLING_TERMS,
} from 'common/spam-terms'
import { MANIFOLD_USER_USERNAME } from 'common/user'
import { DAY_MS } from 'common/util/time'
import { superBanUserCore } from 'shared/helpers/super-ban'
import { log } from 'shared/monitoring/log'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUserByUsername } from 'shared/utils'
import { JobContext } from './helpers'

type CandidateUserRow = {
  id: string
  name: string
  username: string
  balance: number
  userData: {
    avatarUrl?: string
    bio?: string
    referredByUserId?: string
  }
  privateData: {
    initialIpAddress?: string
    initialDeviceToken?: string
  }
}

type BlocklistEntry = {
  entry_type: 'ip' | 'device_token'
  value: string
}

const SCORE_BY_SIGNAL = {
  vietnameseTerm: 100,
  brandName: 80,
  gamblingRegex: 50,
  domainSuffix: 40,
  bioUrl: 40,
  exactIp: 40,
  exactDeviceToken: 40,
  subnetIp: 25,
  nonGoogleAvatar: 10,
} as const

function getIpv4Subnet(ip: string) {
  const parts = ip.split('.')
  if (parts.length !== 4) return undefined
  return parts.slice(0, 3).join('.')
}

function isGoogleAvatar(avatarUrl: string | undefined) {
  return (
    !!avatarUrl &&
    (avatarUrl.includes('googleusercontent.com') || avatarUrl.includes('ggpht.com'))
  )
}

function getNameSignals(name: string, username: string) {
  const normalizedName = normalizeSpamText(name)
  const normalizedUsername = normalizeSpamText(username)
  const haystacks = [normalizedName, normalizedUsername]
  const signals: string[] = []
  let score = 0

  const matchedVietnameseTerm = VIETNAMESE_GAMBLING_TERMS.find((term) =>
    haystacks.some((text) => text.includes(term))
  )
  if (matchedVietnameseTerm) {
    signals.push(`vietnamese-term:${matchedVietnameseTerm}`)
    score += SCORE_BY_SIGNAL.vietnameseTerm
  }

  const matchedBrand = GAMBLING_BRAND_NAMES.find((brand) =>
    haystacks.some((text) => text.includes(brand))
  )
  if (matchedBrand) {
    signals.push(`brand:${matchedBrand}`)
    score += SCORE_BY_SIGNAL.brandName
  }

  const matchedRegex = GAMBLING_REGEXES.find((regex) =>
    regex.test(name) || regex.test(username)
  )
  if (matchedRegex) {
    signals.push(`regex:${matchedRegex.source}`)
    score += SCORE_BY_SIGNAL.gamblingRegex
  }

  if (DOMAIN_SUFFIX_REGEX.test(username)) {
    signals.push('domain-suffix')
    score += SCORE_BY_SIGNAL.domainSuffix
  }

  return { signals, score }
}

async function addBlocklistEntry(
  pg: ReturnType<typeof createSupabaseDirectClient>,
  entryType: 'ip' | 'device_token',
  value: string | undefined,
  reason: string,
  sourceUserId: string
) {
  if (!value) return false
  const existing = await pg.oneOrNone(
    `select id from signup_blocklist
     where entry_type = $1 and value = $2
     limit 1`,
    [entryType, value]
  )

  if (existing) return false

  await pg.none(
    `insert into signup_blocklist (entry_type, value, reason, source_user_id)
     values ($1, $2, $3, $4)`,
    [entryType, value, reason, sourceUserId]
  )
  return true
}

export async function autobanUsers({ lastEndTime }: JobContext) {
  const pg = createSupabaseDirectClient()
  const sinceTime = lastEndTime ?? Date.now() - DAY_MS
  const manifoldUser = await getUserByUsername(MANIFOLD_USER_USERNAME, pg)
  if (!manifoldUser) {
    throw new Error('Manifold user not found')
  }

  const candidates = await pg.manyOrNone<CandidateUserRow>(
    `select
       u.id,
       u.name,
       u.username,
       u.balance,
       u.data as "userData",
       pu.data as "privateData"
     from users u
     join private_users pu on pu.id = u.id
     left join user_bans ub
       on ub.user_id = u.id
      and ub.ended_at is null
      and ub.ban_type in ('posting', 'trading', 'marketControl')
     where u.created_time > to_timestamp($1 / 1000.0)
     group by u.id, u.name, u.username, u.balance, u.data, pu.data
     having count(distinct ub.ban_type) < 3`,
    [sinceTime]
  )

  if (candidates.length === 0) {
    log('No autoban candidates found.')
    return
  }

  const candidateIds = candidates.map((user) => user.id)
  const referredByUserIds = candidates
    .map((user) => user.userData.referredByUserId)
    .filter((id): id is string => !!id)

  const [betRows, blocklistEntries, safeReferrerRows] = await Promise.all([
    pg.manyOrNone<{ user_id: string }>(
      `select distinct user_id
       from contract_bets
       where user_id = any($1)`,
      [candidateIds]
    ),
    pg.manyOrNone<BlocklistEntry>(
      `select entry_type, value from signup_blocklist`
    ),
    referredByUserIds.length === 0
      ? Promise.resolve([])
      : pg.manyOrNone<{ id: string }>(
          `select u.id
           from users u
           left join user_bans ub
             on ub.user_id = u.id
            and ub.ended_at is null
            and ub.ban_type in ('posting', 'trading', 'marketControl')
           where u.id = any($1)
           group by u.id
           having count(distinct ub.ban_type) < 3`,
          [referredByUserIds]
        ),
  ])

  const usersWithBets = new Set(betRows.map((row) => row.user_id))
  const exactIpBlocklist = new Set(
    blocklistEntries
      .filter((entry) => entry.entry_type === 'ip')
      .map((entry) => entry.value)
  )
  const exactDeviceBlocklist = new Set(
    blocklistEntries
      .filter((entry) => entry.entry_type === 'device_token')
      .map((entry) => entry.value)
  )
  const blockedIpv4Subnets = new Set(
    Array.from(exactIpBlocklist)
      .map((ip) => getIpv4Subnet(ip))
      .filter((subnet): subnet is string => !!subnet)
  )
  const safeReferrerIds = new Set(safeReferrerRows.map((row) => row.id))

  let autobannedCount = 0
  let addedIpCount = 0
  let addedDeviceTokenCount = 0
  let failedCount = 0

  for (const candidate of candidates) {
    const hasBets = usersWithBets.has(candidate.id)
    if (candidate.balance > 0 || hasBets) continue

    const referrerId = candidate.userData.referredByUserId
    if (referrerId && safeReferrerIds.has(referrerId)) continue

    const { signals, score: nameScore } = getNameSignals(
      candidate.name,
      candidate.username
    )
    let score = nameScore

    const bio = candidate.userData.bio ?? ''
    if (bio && URL_REGEX.test(bio)) {
      signals.push('bio-url')
      score += SCORE_BY_SIGNAL.bioUrl
    }

    const initialIpAddress = candidate.privateData.initialIpAddress
    const initialDeviceToken = candidate.privateData.initialDeviceToken

    if (initialIpAddress && exactIpBlocklist.has(initialIpAddress)) {
      signals.push('exact-ip')
      score += SCORE_BY_SIGNAL.exactIp
    } else {
      const subnet = initialIpAddress ? getIpv4Subnet(initialIpAddress) : undefined
      if (subnet && blockedIpv4Subnets.has(subnet)) {
        signals.push(`subnet-ip:${subnet}`)
        score += SCORE_BY_SIGNAL.subnetIp
      }
    }

    if (initialDeviceToken && exactDeviceBlocklist.has(initialDeviceToken)) {
      signals.push('exact-device-token')
      score += SCORE_BY_SIGNAL.exactDeviceToken
    }

    if (!isGoogleAvatar(candidate.userData.avatarUrl)) {
      signals.push('non-google-avatar')
      score += SCORE_BY_SIGNAL.nonGoogleAvatar
    }

    if (score < 80) continue

    const reason = `Auto-banned: spam account (score: ${score}, signals: ${signals.join(', ')})`
    try {
      await superBanUserCore(candidate.id, manifoldUser.id, reason)

      const addedIp = await addBlocklistEntry(
        pg,
        'ip',
        initialIpAddress,
        reason,
        candidate.id
      )
      const addedDeviceToken = await addBlocklistEntry(
        pg,
        'device_token',
        initialDeviceToken,
        reason,
        candidate.id
      )

      autobannedCount++
      if (addedIp) addedIpCount++
      if (addedDeviceToken) addedDeviceTokenCount++

      log(
        `Auto-banned ${candidate.username} (score: ${score}, signals: ${signals.join(', ')})`
      )
    } catch (error) {
      failedCount++
      log.error('Failed to autoban candidate user', {
        error,
        userId: candidate.id,
        username: candidate.username,
        score,
        signals,
      })
    }
  }

  log(
    `Auto-banned ${autobannedCount} users, added ${addedIpCount} IPs and ${addedDeviceTokenCount} device tokens to blocklist, with ${failedCount} failures.`
  )
}
