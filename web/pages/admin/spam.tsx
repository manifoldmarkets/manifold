import { JSONContent } from '@tiptap/core'
import clsx from 'clsx'
import Link from 'next/link'
import { useState } from 'react'
import { NoSEO } from 'web/components/NoSEO'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { Avatar } from 'web/components/widgets/avatar'
import { Checkbox } from 'web/components/widgets/checkbox'
import { Content } from 'web/components/widgets/editor'
import { Input } from 'web/components/widgets/input'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Title } from 'web/components/widgets/title'
import { UserLink } from 'web/components/widgets/user-link'
import { useAdmin } from 'web/hooks/use-admin'
import { api } from 'web/lib/api/api'

type SpamComment = {
  commentId: string
  contractId: string
  content: JSONContent | null
  commentText: string
  marketTitle: string
  marketSlug: string
  creatorUsername: string
  userId: string
  userName: string
  userUsername: string
  userAvatarUrl: string | null
  createdTime: number
  isSpam: boolean | null
}

export default function SpamAdmin() {
  const isAdmin = useAdmin()
  const [limit, setLimit] = useState(100)
  const [comments, setComments] = useState<SpamComment[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [ignoredIds, setIgnoredIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const fetchComments = async () => {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const result = await api('get-suspected-spam-comments', {
        limit,
        ignoredIds: Array.from(ignoredIds),
      })
      setComments(result.comments)
      setTotal(result.total)
      // Auto-select comments marked as spam
      const spamIds = new Set(
        result.comments.filter((c) => c.isSpam).map((c) => c.commentId)
      )
      setSelectedIds(spamIds)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch comments')
    } finally {
      setLoading(false)
    }
  }

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const selectAll = () => {
    setSelectedIds(new Set(comments.map((c) => c.commentId)))
  }

  const selectNone = () => {
    setSelectedIds(new Set())
  }

  const selectSpam = () => {
    setSelectedIds(
      new Set(comments.filter((c) => c.isSpam).map((c) => c.commentId))
    )
  }

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return

    setDeleting(true)
    setError(null)
    setMessage(null)
    try {
      const result = await api('delete-spam-comments', {
        commentIds: Array.from(selectedIds),
      })
      setMessage(`Deleted ${result.deletedCount} comments`)
      // Remove deleted comments from list
      setComments(comments.filter((c) => !selectedIds.has(c.commentId)))
      setSelectedIds(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete comments')
    } finally {
      setDeleting(false)
    }
  }

  const ignoreSelected = () => {
    if (selectedIds.size === 0) return
    // Add selected to ignored list
    const newIgnored = new Set(ignoredIds)
    selectedIds.forEach((id) => newIgnored.add(id))
    setIgnoredIds(newIgnored)
    // Remove from current view
    setComments(comments.filter((c) => !selectedIds.has(c.commentId)))
    setSelectedIds(new Set())
    setMessage(
      `Ignored ${selectedIds.size} comments (will be excluded from next fetch)`
    )
  }

  const clearIgnoreList = () => {
    setIgnoredIds(new Set())
    setMessage('Ignore list cleared')
  }

  if (!isAdmin) return <></>

  return (
    <Page trackPageView={false} className="px-2">
      <NoSEO />
      <Title>Spam Detection</Title>

      <Col className="gap-4">
        <Row className="flex-wrap items-end gap-4">
          <Col className="gap-1">
            <label className="text-ink-600 text-sm">
              Limit (comments to check)
            </label>
            <Input
              type="number"
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value) || 20)}
              className="w-24"
              min={1}
              max={1000}
            />
          </Col>
          <Button onClick={fetchComments} disabled={loading}>
            {loading ? 'Loading...' : 'Fetch Suspected Spam'}
          </Button>
          {ignoredIds.size > 0 && (
            <Row className="items-center gap-2">
              <span className="text-ink-500 text-sm">
                {ignoredIds.size} ignored
              </span>
              <Button size="xs" color="gray-outline" onClick={clearIgnoreList}>
                Clear
              </Button>
            </Row>
          )}
        </Row>

        {error && (
          <div className="bg-scarlet-100 text-scarlet-700 rounded p-2">
            {error}
          </div>
        )}

        {message && (
          <div className="rounded bg-teal-100 p-2 text-teal-700">{message}</div>
        )}

        {loading && <LoadingIndicator />}

        {!loading && comments.length > 0 && (
          <>
            <Row className="items-center justify-between">
              <div className="text-ink-600">
                Found {comments.length} comments with links (out of {total}{' '}
                total suspected)
              </div>
              <Row className="gap-2">
                <Button size="xs" color="gray-outline" onClick={selectAll}>
                  Select All
                </Button>
                <Button size="xs" color="gray-outline" onClick={selectNone}>
                  Select None
                </Button>
                <Button size="xs" color="gray-outline" onClick={selectSpam}>
                  Select AI-Flagged
                </Button>
              </Row>
            </Row>

            <Row className="items-center gap-4">
              <Button
                color="red"
                onClick={deleteSelected}
                disabled={selectedIds.size === 0 || deleting}
                loading={deleting}
              >
                Delete {selectedIds.size} Selected
              </Button>
              <Button
                color="gray-outline"
                onClick={ignoreSelected}
                disabled={selectedIds.size === 0 || deleting}
              >
                Ignore {selectedIds.size} Selected
              </Button>
            </Row>

            <Col className="gap-4">
              {comments.map((comment) => (
                <CommentCard
                  key={comment.commentId}
                  comment={comment}
                  selected={selectedIds.has(comment.commentId)}
                  onToggle={() => toggleSelect(comment.commentId)}
                />
              ))}
            </Col>
          </>
        )}

        {!loading && comments.length === 0 && total === 0 && (
          <div className="text-ink-500">
            Click "Fetch Suspected Spam" to load comments for review
          </div>
        )}
      </Col>
    </Page>
  )
}

function CommentCard({
  comment,
  selected,
  onToggle,
}: {
  comment: SpamComment
  selected: boolean
  onToggle: () => void
}) {
  const marketUrl = `/${comment.creatorUsername}/${comment.marketSlug}`
  const commentUrl = `${marketUrl}#${comment.commentId}`

  return (
    <div
      className={clsx(
        'bg-canvas-0 rounded-lg border p-4',
        selected ? 'border-scarlet-500 bg-scarlet-50' : 'border-ink-200',
        comment.isSpam && 'ring-scarlet-300 ring-2'
      )}
    >
      <Row className="items-start gap-3">
        <Checkbox
          label=""
          checked={selected}
          toggle={onToggle}
          className="mt-1"
        />

        <Col className="flex-1 gap-2">
          <Row className="items-center justify-between">
            <Row className="items-center gap-2">
              <Avatar
                username={comment.userUsername}
                avatarUrl={comment.userAvatarUrl ?? undefined}
                size="sm"
              />
              <UserLink
                user={{
                  id: comment.userId,
                  name: comment.userName,
                  username: comment.userUsername,
                }}
              />
              {comment.isSpam !== null && (
                <span
                  className={clsx(
                    'rounded px-2 py-0.5 text-xs font-semibold',
                    comment.isSpam
                      ? 'bg-scarlet-100 text-scarlet-700'
                      : 'bg-teal-100 text-teal-700'
                  )}
                >
                  {comment.isSpam ? 'AI: SPAM' : 'AI: OK'}
                </span>
              )}
            </Row>
            <RelativeTimestamp time={comment.createdTime} />
          </Row>

          <Link href={marketUrl} className="text-primary-700 text-sm">
            On: {comment.marketTitle}
          </Link>

          <div className="bg-canvas-50 max-h-[200px] overflow-y-auto rounded p-2">
            {comment.content ? (
              <Content size="sm" content={comment.content} />
            ) : (
              <span className="text-ink-500 italic">No content</span>
            )}
          </div>

          <Link
            href={commentUrl}
            className="text-ink-500 text-xs hover:underline"
          >
            View comment →
          </Link>
        </Col>
      </Row>
    </div>
  )
}
