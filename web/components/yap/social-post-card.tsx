import { SocialText } from './social-text'
import DropdownMenu from '../widgets/dropdown-menu'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  ChatAltIcon,
  HeartIcon,
  ExternalLinkIcon,
} from '@heroicons/react/outline'
import { HeartIcon as HeartSolid } from '@heroicons/react/solid'
import { contractPath, getBinaryProbPercent } from 'common/contract'
import {
  SocialPost,
  SocialLikerPage,
  socialPostPath,
  SOCIAL_POST_MAX_MARKETS,
} from 'common/social-post'
import { api } from 'web/lib/api/api'
import { firebaseLogin } from 'web/lib/firebase/users'
import { useUser } from 'web/hooks/use-user'
import { useAdminOrMod } from 'web/hooks/use-admin'
import { Avatar } from '../widgets/avatar'
import { RelativeTimestamp } from '../relative-timestamp'
import { Button } from '../buttons/button'
import { ReportModal } from '../buttons/report-button'
import { Modal } from '../layout/modal'
import { SocialComposer } from './social-composer'
import { SocialPostList } from './social-post-list'

export function SocialPostCard({
  post,
  onChanged,
  previews = true,
  depth = 0,
  refreshKey = 0,
  showReplyActions = true,
}: {
  post: SocialPost
  onChanged: () => void
  previews?: boolean
  depth?: number
  refreshKey?: number
  showReplyActions?: boolean
}) {
  const router = useRouter()
  const user = useUser()
  const mod = useAdminOrMod()
  const [replying, setReplying] = useState(false)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [allMarkets, setAllMarkets] = useState(false)
  const [likersOpen, setLikersOpen] = useState(false)
  const [liked, setLiked] = useState(post.liked)
  const [likeCount, setLikeCount] = useState(post.likeCount)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  useEffect(() => {
    setLiked(post.liked)
    setLikeCount(post.likeCount)
  }, [post.liked, post.likeCount])
  async function like() {
    if (!user) {
      await firebaseLogin()
      return
    }
    if (busy) return
    setBusy(true)
    setError(undefined)
    const previous = liked
    setLiked(!previous)
    setLikeCount((n) => n + (previous ? -1 : 1))
    try {
      await api('react', {
        contentId: post.id,
        contentType: 'social_post',
        remove: previous,
      })
    } catch (e) {
      setLiked(previous)
      setLikeCount((n) => n + (previous ? 1 : -1))
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const changed = () => {
    setEditing(false)
    setReplying(false)
    onChanged()
  }
  const own = user?.id === post.author.id
  const replyCountButton = showReplyActions && post.replyCount > 0 && (
    <button
      className="text-ink-500 dark:text-ink-600 hover:text-primary-700 rounded-full px-2 py-2 text-xs hover:underline"
      aria-expanded={expanded}
      onClick={() => setExpanded(!expanded)}
    >
      {post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'}
    </button>
  )
  return (
    <article
      className="border-ink-200 dark:border-ink-300 border-b last:border-b-0"
      aria-label={`Post by ${post.author.name}`}
    >
      <div
        className="hover:bg-canvas-50/50 grid cursor-pointer grid-cols-[2rem_minmax(0,1fr)] gap-x-3 px-4 py-3 transition-colors"
        role="link"
        tabIndex={0}
        aria-label={`Open post by ${post.author.name}`}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && e.key === 'Enter') {
            e.preventDefault()
            void router.push(socialPostPath(post.id))
          }
        }}
        onClick={(e) => {
          if (
            !(e.target as HTMLElement).closest(
              'a,button,input,textarea,select,[data-social-composer]'
            ) &&
            !window.getSelection()?.toString()
          )
            void router.push(socialPostPath(post.id))
        }}
      >
        <Avatar
          size="sm"
          avatarUrl={post.author.avatarUrl}
          username={post.author.username}
        />
        <div className="min-w-0">
          <div className="mb-1 flex min-w-0 items-center gap-1 text-sm">
            <Link
              className="text-ink-900 min-w-0 truncate font-bold hover:underline"
              href={`/${post.author.username}`}
            >
              {post.author.name}
            </Link>
            <span className="text-ink-500 dark:text-ink-600 min-w-0 truncate">
              @{post.author.username}
            </span>
            <span className="text-ink-500" aria-hidden="true">
              ·
            </span>
            <Link
              className="text-ink-500 dark:text-ink-600 shrink-0 text-sm hover:underline"
              href={socialPostPath(post.id)}
            >
              <RelativeTimestamp
                time={Date.parse(post.createdTime)}
                shortened
                className="text-ink-500 dark:text-ink-600"
              />
            </Link>
            {post.editedTime && !post.removed && (
              <span
                title={new Date(post.editedTime).toLocaleString()}
                className="text-ink-400 text-xs"
              >
                edited
              </span>
            )}
            {user && !post.removed && (
              <div className="text-ink-500 dark:text-ink-600 ml-auto shrink-0">
                <DropdownMenu
                  closeOnClick
                  items={[
                    ...(own
                      ? [{ name: 'Edit', onClick: () => setEditing(true) }]
                      : []),
                    ...(own || mod
                      ? [
                          {
                            name: own ? 'Delete' : 'Remove',
                            onClick: () => setDeleting(true),
                          },
                        ]
                      : []),
                    ...(!own
                      ? [{ name: 'Report', onClick: () => setReporting(true) }]
                      : []),
                  ]}
                />
              </div>
            )}
          </div>
          {post.parentId && (
            <Link
              className="text-ink-500 mb-2 block text-xs hover:underline"
              href={socialPostPath(post.parentId)}
            >
              {post.parentAuthor
                ? `Replying to @${post.parentAuthor.username}`
                : 'View parent post'}
            </Link>
          )}
          {post.removed ? (
            <>
              <p className="text-ink-400 py-2 italic">
                {post.removed === 'blocked'
                  ? 'Post unavailable because of a block'
                  : post.removed === 'moderator'
                  ? 'Removed by moderators'
                  : 'Deleted by author'}
              </p>
              {replyCountButton}
            </>
          ) : editing ? (
            <SocialComposer
              editing={post}
              onPosted={changed}
              onCancel={() => setEditing(false)}
              focusOnMount
            />
          ) : (
            <>
              <SocialText text={post.text} />
              {post.source && (
                <a
                  className="border-ink-200 dark:border-ink-300 text-ink-600 mt-3 flex items-start gap-2 rounded-2xl border p-3 text-sm hover:underline"
                  href={post.source.url}
                >
                  <ExternalLinkIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="line-clamp-3">{post.source.text}</span>
                </a>
              )}
              <div className={post.markets.length ? 'mt-3 space-y-2' : ''}>
                {post.markets
                  .slice(0, allMarkets ? SOCIAL_POST_MAX_MARKETS : 3)
                  .map((market) => (
                    <Link
                      key={market.id}
                      href={contractPath(market)}
                      className="border-ink-200 dark:border-ink-300 hover:bg-canvas-50 flex items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-sm transition-colors"
                    >
                      <span className="min-w-0 break-words font-medium">
                        {market.question}
                      </span>
                      <span className="text-primary-700 bg-primary-500/10 shrink-0 rounded-lg px-2 py-1 font-semibold tabular-nums">
                        {market.resolution ??
                          (market.outcomeType === 'BINARY'
                            ? getBinaryProbPercent(market)
                            : market.isResolved
                            ? 'Resolved'
                            : 'View market')}
                      </span>
                    </Link>
                  ))}
              </div>
              {post.markets.length > 3 && (
                <button
                  className="text-primary-700 mt-2 text-sm"
                  onClick={() => setAllMarkets(!allMarkets)}
                >
                  {allMarkets
                    ? 'Show fewer markets'
                    : `Show all ${post.markets.length} markets`}
                </button>
              )}
              {post.unavailableMarketCount > 0 && (
                <p className="text-ink-400 mt-2 text-sm">
                  {post.unavailableMarketCount === 1
                    ? 'Market unavailable'
                    : `${post.unavailableMarketCount} markets unavailable`}
                </p>
              )}
              <div className="text-ink-500 dark:text-ink-600 -mb-1 -ml-2 mt-2 flex flex-wrap items-center gap-x-5 text-sm">
                {showReplyActions && (
                  <button
                    className="hover:text-primary-700 hover:bg-primary-500/10 flex items-center gap-2 rounded-full px-2 py-2 transition-colors disabled:opacity-40"
                    disabled={!post.canReply}
                    aria-expanded={replying}
                    onClick={() => setReplying(!replying)}
                  >
                    <ChatAltIcon className="h-[18px] w-[18px]" /> Reply
                  </button>
                )}
                <div className="flex items-center">
                  <button
                    aria-label={liked ? 'Unlike post' : 'Like post'}
                    aria-pressed={liked}
                    disabled={busy}
                    onClick={like}
                    className={`rounded-full p-2 transition-colors hover:bg-rose-500/10 ${
                      liked ? 'text-rose-500' : 'hover:text-rose-500'
                    }`}
                  >
                    {liked ? (
                      <HeartSolid className="h-[18px] w-[18px]" />
                    ) : (
                      <HeartIcon className="h-[18px] w-[18px]" />
                    )}
                  </button>
                  <button
                    aria-label="View people who liked this post"
                    className="py-2 pr-2 text-xs tabular-nums hover:text-rose-500 hover:underline"
                    onClick={() => setLikersOpen(true)}
                  >
                    {likeCount}
                  </button>
                </div>
                {replyCountButton}
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="mt-2 text-sm text-red-600">
              {error}
            </p>
          )}
        </div>
      </div>
      {replying && !post.removed && (
        <SocialComposer
          parentId={post.id}
          onPosted={changed}
          onCancel={() => setReplying(false)}
          focusOnMount
        />
      )}
      {expanded ? (
        <div
          className={
            depth < 2
              ? 'border-ink-200 dark:border-ink-300 ml-5 border-l sm:ml-8'
              : ''
          }
        >
          <SocialPostList
            parentId={post.id}
            depth={depth + 1}
            refreshKey={refreshKey}
            onChanged={onChanged}
          />
        </div>
      ) : (
        previews &&
        post.replyPreviews.length > 0 && (
          <div
            className={
              depth < 2
                ? 'border-ink-200 dark:border-ink-300 ml-5 border-l sm:ml-8'
                : ''
            }
          >
            {post.replyPreviews.map((reply) => (
              <SocialPostCard
                key={reply.id}
                post={reply}
                onChanged={onChanged}
                previews={false}
                depth={depth + 1}
                refreshKey={refreshKey}
              />
            ))}
            {post.replyCount > post.replyPreviews.length && (
              <button
                className="text-primary-700 px-4 py-3 text-sm"
                onClick={() => setExpanded(true)}
              >
                View all replies
              </button>
            )}
          </div>
        )
      )}
      <ReportModal
        isModalOpen={reporting}
        setIsModalOpen={setReporting}
        label="post"
        report={{
          contentType: 'social_post',
          contentId: post.id,
          contentOwnerId: post.author.id,
        }}
      />
      <Modal open={likersOpen} setOpen={setLikersOpen}>
        {likersOpen && <SocialLikers id={post.id} />}
      </Modal>
      <Modal open={deleting} setOpen={setDeleting}>
        <div className="bg-canvas-0 rounded-xl p-5">
          <h2 className="text-lg font-semibold">
            {own ? 'Delete this post?' : 'Remove this post?'}
          </h2>
          <p className="text-ink-500 my-3 text-sm">
            Existing replies remain visible. Removing a top-level post closes
            the discussion to new replies.
          </p>
          <div className="flex justify-end gap-3">
            <Button color="gray" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={busy}
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await api('delete-social-post', { id: post.id })
                  setDeleting(false)
                  onChanged()
                } catch (e) {
                  setError((e as Error).message)
                  setDeleting(false)
                } finally {
                  setBusy(false)
                }
              }}
            >
              Remove
            </Button>
          </div>
        </div>
      </Modal>
    </article>
  )
}
function SocialLikers({ id }: { id: string }) {
  const [page, setPage] = useState<SocialLikerPage>({
    users: [],
    nextCursor: null,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>()
  async function load(cursor?: string) {
    setLoading(true)
    setError(undefined)
    try {
      const next = await api('get-social-likers', { id, cursor })
      setPage((p) => ({
        users: cursor ? [...p.users, ...next.users] : next.users,
        nextCursor: next.nextCursor,
      }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
  }, [id])
  return (
    <div className="bg-canvas-0 max-h-[70vh] overflow-auto rounded-xl p-5">
      <h2 className="mb-4 text-lg font-semibold">Liked by</h2>
      {page.users.map((user) => (
        <Link
          key={user.id}
          href={`/${user.username}`}
          className="mb-3 flex items-center gap-3"
        >
          <Avatar
            size="sm"
            username={user.username}
            avatarUrl={user.avatarUrl}
          />
          <span>{user.name}</span>
        </Link>
      ))}
      {!loading && !error && !page.users.length && (
        <p className="text-ink-500">No likes yet.</p>
      )}
      {error && <p role="alert">{error}</p>}
      {(page.nextCursor || error) && (
        <Button
          disabled={loading}
          onClick={() => load(page.nextCursor ?? undefined)}
        >
          Load more
        </Button>
      )}
      {loading && <p className="text-ink-400">Loading…</p>}
    </div>
  )
}
