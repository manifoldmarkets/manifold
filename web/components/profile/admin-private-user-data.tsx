import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/outline'
import { useState } from 'react'
import { FullUser } from 'common/api/user-types'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { api } from 'web/lib/api/api'
import Link from 'next/link'

type MatchReason = 'ip' | 'deviceToken' | 'referrer' | 'referee' | 'managram'

type RelatedMatch = {
  visibleUser: FullUser
  matchReasons: MatchReason[]
  netManagramAmount?: number
}

// Scoring: deviceToken (3) > IP (2) > referral (1) > managram (0.5)
function getMatchScore(matchReasons: MatchReason[]): number {
  let score = 0
  if (matchReasons.includes('deviceToken')) score += 3
  if (matchReasons.includes('ip')) score += 2
  if (matchReasons.includes('referrer')) score += 1
  if (matchReasons.includes('referee')) score += 1
  if (matchReasons.includes('managram')) score += 0.5
  return score
}

function sortByMatchScore(matches: RelatedMatch[]): RelatedMatch[] {
  return [...matches].sort(
    (a, b) => getMatchScore(b.matchReasons) - getMatchScore(a.matchReasons)
  )
}

function formatTimeDiffBetween(
  time1: number | undefined,
  time2: number | undefined
) {
  if (!time1 || !time2 || isNaN(time1) || isNaN(time2)) return null
  const ms = Math.abs(time1 - time2)
  const minutes = Math.floor(ms / (1000 * 60))
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  if (minutes < 1) return 'same minute'
  if (minutes < 60) return `${minutes}m apart`
  if (hours < 24) return `${hours}h apart`
  if (days < 30) return `${days}d apart`
  return `${Math.floor(days / 30)}mo apart`
}

function RelatedUserRow(props: {
  user: FullUser
  matchReasons: MatchReason[]
  timeDiff: string | null
  rootUserId: string
  depth?: number
  netManagramAmount?: number
}) {
  const {
    user,
    matchReasons,
    timeDiff,
    rootUserId,
    depth = 0,
    netManagramAmount,
  } = props
  const [expanded, setExpanded] = useState(false)
  const [subMatches, setSubMatches] = useState<RelatedMatch[]>([])
  const [subTargetCreatedTime, setSubTargetCreatedTime] = useState<
    number | undefined
  >()
  const [loadingSub, setLoadingSub] = useState(false)

  const handleExpand = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (expanded) {
      setExpanded(false)
      return
    }

    setLoadingSub(true)
    try {
      const result = await api('admin-get-related-users', { userId: user.id })
      // Filter out the root user to avoid circular display, then sort by score
      const filtered = sortByMatchScore(
        result.matches.filter(
          (m: RelatedMatch) => m.visibleUser.id !== rootUserId
        )
      )
      setSubMatches(filtered)
      setSubTargetCreatedTime(result.targetCreatedTime)
      setExpanded(true)
    } catch (err) {
      console.error('Error fetching sub-connections:', err)
    } finally {
      setLoadingSub(false)
    }
  }

  return (
    <Col>
      <div className="bg-canvas-0 hover:bg-canvas-100 flex items-center justify-between gap-2 overflow-hidden rounded border p-2">
        <Link
          href={`/${user.username}`}
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          <Avatar
            username={user.username}
            avatarUrl={user.avatarUrl}
            size="xs"
            className="flex-shrink-0"
          />
          <div className="min-w-0 text-sm">
            <span className="font-medium">{user.name}</span>
            {user.userDeleted && (
              <span className="ml-1 text-xs text-red-600">[DEL]</span>
            )}
            <span className="text-ink-500 ml-1 truncate">@{user.username}</span>
          </div>
        </Link>
        <Row className="flex-shrink-0 items-center gap-1">
          {matchReasons.includes('referrer') && (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800">
              Referrer
            </span>
          )}
          {matchReasons.includes('referee') && (
            <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800">
              Referred
            </span>
          )}
          {matchReasons.includes('ip') && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800">
              IP
            </span>
          )}
          {matchReasons.includes('deviceToken') && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800">
              Device
            </span>
          )}
          {matchReasons.includes('managram') &&
            netManagramAmount !== undefined && (
              <span
                className={`rounded px-1.5 py-0.5 text-xs ${
                  netManagramAmount > 0
                    ? 'bg-green-100 text-green-800'
                    : netManagramAmount < 0
                    ? 'bg-red-100 text-red-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {netManagramAmount > 0 ? '+' : ''}
                {Math.round(netManagramAmount).toLocaleString()}
              </span>
            )}
          {timeDiff && <span className="text-ink-500 text-xs">{timeDiff}</span>}
          {depth < 2 && (
            <button
              onClick={handleExpand}
              className="text-primary-600 hover:text-primary-700 ml-1 text-xs underline"
            >
              {loadingSub ? '...' : expanded ? 'hide' : '+'}
            </button>
          )}
        </Row>
      </div>
      {expanded && subMatches.length > 0 && (
        <div className="border-ink-200 ml-4 mt-1 space-y-1 border-l-2 pl-2">
          {subMatches.slice(0, 5).map((match) => (
            <RelatedUserRow
              key={match.visibleUser.id}
              user={match.visibleUser}
              matchReasons={match.matchReasons}
              timeDiff={formatTimeDiffBetween(
                subTargetCreatedTime,
                match.visibleUser.createdTime
              )}
              rootUserId={rootUserId}
              depth={depth + 1}
              netManagramAmount={match.netManagramAmount}
            />
          ))}
          {subMatches.length > 5 && (
            <div className="text-ink-500 text-xs">
              +{subMatches.length - 5} more connections
            </div>
          )}
        </div>
      )}
      {expanded && subMatches.length === 0 && (
        <div className="text-ink-500 ml-6 mt-1 text-xs">
          No additional connections
        </div>
      )}
    </Col>
  )
}

export function AdminPrivateUserData(props: { userId: string }) {
  const { userId } = props
  const [showAllRelated, setShowAllRelated] = useState(false)

  const { data: privateUser, loading } = useAPIGetter('get-user-private-data', {
    userId,
  })

  const { data: relatedData, loading: loadingRelated } = useAPIGetter(
    'admin-get-related-users',
    { userId }
  )

  if (loading) {
    return <LoadingIndicator />
  }

  if (!privateUser) {
    return <div className="text-ink-600">No private user data found</div>
  }

  // Exclude notification preferences as requested
  const { initialIpAddress, initialDeviceToken, email } = privateUser

  const relatedUsers = sortByMatchScore(relatedData?.matches ?? [])
  const targetCreatedTime = relatedData?.targetCreatedTime
  const displayedUsers = showAllRelated
    ? relatedUsers
    : relatedUsers.slice(0, 3)

  // Compute summary stats
  const stats = {
    referrer: relatedUsers.filter((m) => m.matchReasons.includes('referrer'))
      .length,
    referees: relatedUsers.filter((m) => m.matchReasons.includes('referee'))
      .length,
    refereesWithIp: relatedUsers.filter(
      (m) => m.matchReasons.includes('referee') && m.matchReasons.includes('ip')
    ).length,
    ip: relatedUsers.filter((m) => m.matchReasons.includes('ip')).length,
    device: relatedUsers.filter((m) => m.matchReasons.includes('deviceToken'))
      .length,
    managram: relatedUsers.filter((m) => m.matchReasons.includes('managram'))
      .length,
  }

  const summaryParts: string[] = []
  if (stats.referrer > 0) summaryParts.push(`${stats.referrer} referrer`)
  if (stats.referees > 0) {
    const refPart =
      stats.refereesWithIp > 0
        ? `${stats.referees} referred (${stats.refereesWithIp} with matching IP)`
        : `${stats.referees} referred`
    summaryParts.push(refPart)
  }
  if (stats.ip > 0) summaryParts.push(`${stats.ip} matching IP`)
  if (stats.device > 0) summaryParts.push(`${stats.device} matching device`)
  if (stats.managram > 0) summaryParts.push(`${stats.managram} managram`)

  return (
    <Col className="gap-4">
      <div className="text-ink-600 text-sm">
        Admin-only view of private user data
      </div>
      <div className="bg-canvas-50 rounded-lg p-4">
        <pre className="text-ink-1000 whitespace-pre-wrap break-words text-sm">
          {JSON.stringify(
            { initialIpAddress, initialDeviceToken, email },
            null,
            2
          )}
        </pre>
      </div>

      {/* Related Accounts Section */}
      <div className="border-ink-200 overflow-hidden rounded border p-3">
        <div className="mb-1 font-semibold">Related Accounts</div>
        {loadingRelated ? (
          <div className="text-ink-500 text-sm">Loading...</div>
        ) : relatedUsers.length === 0 ? (
          <div className="text-ink-500 text-sm">No related accounts found.</div>
        ) : (
          <Col className="gap-2">
            <div className="text-ink-600 text-xs">
              {summaryParts.join(' · ')}
            </div>
            {displayedUsers.map(
              ({
                visibleUser,
                matchReasons,
                netManagramAmount,
              }: RelatedMatch) => (
                <RelatedUserRow
                  key={visibleUser.id}
                  user={visibleUser}
                  matchReasons={matchReasons}
                  timeDiff={formatTimeDiffBetween(
                    targetCreatedTime,
                    visibleUser.createdTime
                  )}
                  rootUserId={userId}
                  netManagramAmount={netManagramAmount}
                />
              )
            )}
            {relatedUsers.length > 3 && (
              <button
                onClick={() => setShowAllRelated(!showAllRelated)}
                className="text-primary-600 hover:text-primary-700 flex items-center gap-1 text-sm"
              >
                {showAllRelated ? (
                  <>
                    <ChevronUpIcon className="h-4 w-4" />
                    Show less
                  </>
                ) : (
                  <>
                    <ChevronDownIcon className="h-4 w-4" />
                    Show all {relatedUsers.length} accounts
                  </>
                )}
              </button>
            )}
          </Col>
        )}
      </div>
    </Col>
  )
}
