import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/outline'
import { useState } from 'react'
import { FullUser } from 'common/api/user-types'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import Link from 'next/link'

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

  const relatedUsers = relatedData?.matches ?? []
  const targetCreatedTime = relatedData?.targetCreatedTime
  const displayedUsers = showAllRelated ? relatedUsers : relatedUsers.slice(0, 3)

  const formatTimeDiff = (matchCreatedTime: number) => {
    if (!targetCreatedTime || !matchCreatedTime) return null
    const ms = Math.abs(targetCreatedTime - matchCreatedTime)
    const minutes = Math.floor(ms / (1000 * 60))
    const hours = Math.floor(ms / (1000 * 60 * 60))
    const days = Math.floor(ms / (1000 * 60 * 60 * 24))
    if (minutes < 1) return 'same minute'
    if (minutes < 60) return `${minutes}m apart`
    if (hours < 24) return `${hours}h apart`
    if (days < 30) return `${days}d apart`
    return `${Math.floor(days / 30)}mo apart`
  }

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
      <div className="border-ink-200 rounded border p-3">
        <div className="mb-2 font-semibold">Related Accounts (Potential Alts)</div>
        {loadingRelated ? (
          <div className="text-ink-500 text-sm">Loading...</div>
        ) : relatedUsers.length === 0 ? (
          <div className="text-ink-500 text-sm">No matching IP or device token found.</div>
        ) : (
          <Col className="gap-2">
            <div className="text-ink-600 text-xs">
              Found {relatedUsers.length} account{relatedUsers.length !== 1 ? 's' : ''}
            </div>
            {displayedUsers.map(({ visibleUser, matchReasons }: { visibleUser: FullUser; matchReasons: ('ip' | 'deviceToken')[] }) => {
              const timeDiff = formatTimeDiff(visibleUser.createdTime)
              return (
                <Link
                  key={visibleUser.id}
                  href={`/${visibleUser.username}`}
                  className="bg-canvas-0 hover:bg-canvas-100 flex items-center justify-between rounded border p-2"
                >
                  <Row className="items-center gap-2">
                    <Avatar
                      username={visibleUser.username}
                      avatarUrl={visibleUser.avatarUrl}
                      size="xs"
                    />
                    <div className="text-sm">
                      <span className="font-medium">{visibleUser.name}</span>
                      {visibleUser.userDeleted && (
                        <span className="ml-1 text-xs text-red-600">[DEL]</span>
                      )}
                      <span className="text-ink-500 ml-1">@{visibleUser.username}</span>
                    </div>
                  </Row>
                  <Row className="items-center gap-1">
                    {matchReasons.includes('ip') && (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800">IP</span>
                    )}
                    {matchReasons.includes('deviceToken') && (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800">Device</span>
                    )}
                    {timeDiff && (
                      <span className="text-ink-500 ml-1 text-xs">{timeDiff}</span>
                    )}
                  </Row>
                </Link>
              )
            })}
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
