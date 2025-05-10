import Link from 'next/link'
import { useEffect, useState } from 'react'
import { UserHovercard } from 'web/components/user/user-hovercard'
import { Avatar } from 'web/components/widgets/avatar'
import { Content } from 'web/components/widgets/editor'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { UserLink, BannedBadge } from 'web/components/widgets/user-link'
import { Tooltip } from 'web/components/widgets/tooltip'
import { LiteReport } from 'web/pages/admin/reports'
import SuperBanControl from 'web/components/SuperBanControl'
import { useAdmin } from 'web/hooks/use-admin'
import { api } from 'web/lib/api/api'
import toast from 'react-hot-toast'
import { Button } from 'web/components/buttons/button'

export default function UserReportItem(props: {
  report: LiteReport
  bannedIds: string[]
  onBan: (userId: string) => void
}) {
  const {
    slug,
    text,
    owner,
    reporter,
    contentType,
    createdTime,
    reasonsDescription,
    id: reportId,
  } = props.report
  const { bannedIds, onBan } = props
  const isBanned = owner.isBannedFromPosting || bannedIds.includes(owner.id)
  const [showContent, setShowContent] = useState(!isBanned)
  const [isDismissedLocal, setIsDismissedLocal] = useState(false)
  const isAdmin = useAdmin()

  useEffect(() => {
    setShowContent(!isBanned)
  }, [isBanned])

  const handleDismiss = async () => {
    if (!reportId) return
    try {
      await toast.promise(api('dismiss-user-report', { reportId }), {
        loading: 'Dismissing report...',
        success: 'Report dismissed',
        error: 'Failed to dismiss report',
      })
      setIsDismissedLocal(true)
    } catch (e) {
      console.error('Error dismissing report:', e)
    }
  }

  if (isDismissedLocal) return null

  return (
    <div className="bg-canvas-50 my-4 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserHovercard userId={owner.id}>
            <div className="flex items-center">
              <Avatar
                username={owner.username}
                avatarUrl={owner.avatarUrl}
                size="sm"
              />
              <UserLink user={owner} className="text-ink-800 ml-2" />
              {isBanned && <BannedBadge />}
            </div>
          </UserHovercard>

          <div>
            {contentType === 'user' ? (
              'was reported'
            ) : (
              <>
                <Tooltip
                  text={
                    <div className="flex gap-1">
                      <Avatar
                        username={reporter.username}
                        avatarUrl={reporter.avatarUrl}
                        size="xs"
                      />
                      <UserLink user={reporter} />
                    </div>
                  }
                >
                  was reported for this{' '}
                </Tooltip>
                <Link href={slug} className="text-primary-700 text-md my-1">
                  {contentType}
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SuperBanControl
            userId={owner.id}
            onBan={() => onBan(owner.id)}
            disabled={isBanned}
          />
          {isAdmin && (
            <Button
              color="red-outline"
              size="xs"
              onClick={handleDismiss}
              className="whitespace-nowrap"
            >
              Dismiss Report
            </Button>
          )}
          {createdTime && <RelativeTimestamp time={createdTime} />}
        </div>
      </div>

      {contentType !== 'user' && (
        <>
          {isBanned && (
            <button
              onClick={() => setShowContent(!showContent)}
              className="text-ink-500 mt-2 cursor-pointer text-sm hover:underline"
            >
              {showContent ? 'Hide content' : 'Show content from banned user'}
            </button>
          )}
          {showContent && (
            <div className="bg-canvas-0 my-2 max-h-[300px] overflow-y-auto rounded-lg p-2">
              <Content size="md" content={text} />
            </div>
          )}
        </>
      )}

      {reasonsDescription && (
        <div className="text-ink-700 mt-2">{reasonsDescription}</div>
      )}
    </div>
  )
}
