import { useCallback, useEffect, useRef, useState } from 'react'
import { SocialPost, SocialPostPage } from 'common/social-post'
import { api } from 'web/lib/api/api'
import { useUser } from 'web/hooks/use-user'
import { Button } from '../buttons/button'
import { SocialPostCard } from './social-post-card'

export function SocialPostList({
  parentId,
  refreshKey = 0,
  depth = 0,
  onChanged,
  initialPage,
}: {
  parentId?: string
  refreshKey?: number
  depth?: number
  onChanged?: () => void
  initialPage?: SocialPostPage
}) {
  const user = useUser()
  const [page, setPage] = useState<SocialPostPage>(
    initialPage ?? {
      posts: [],
      nextCursor: null,
    }
  )
  const [loading, setLoading] = useState(!initialPage)
  const [reactionViewer, setReactionViewer] = useState<string>()
  const reactionsLoading = !!initialPage && !!user && reactionViewer !== user.id
  const [error, setError] = useState<{ message: string; cursor?: string }>()
  const [version, setVersion] = useState(0)
  const sentinel = useRef<HTMLDivElement>(null)
  const generation = useRef(0)
  const pending = useRef(false)
  const load = useCallback(
    async (cursor?: string) => {
      if (pending.current) return
      const current = generation.current
      pending.current = true
      setLoading(true)
      setError(undefined)
      try {
        const next = await api('get-social-posts', { parentId, cursor })
        if (current !== generation.current) return
        setReactionViewer(user?.id)
        setPage((previous) => {
          if (!cursor) return next
          const previousIds = new Set(previous.posts.map((post) => post.id))
          return {
            nextCursor: next.nextCursor,
            posts: [
              ...previous.posts,
              ...next.posts.filter((post) => !previousIds.has(post.id)),
            ],
          }
        })
      } catch (e) {
        if (current === generation.current)
          setError({ message: (e as Error).message, cursor })
      } finally {
        if (current === generation.current) {
          pending.current = false
          setLoading(false)
        }
      }
    },
    [parentId, user?.id]
  )
  useEffect(() => {
    generation.current++
    pending.current = false
    const current = generation.current
    if (initialPage && refreshKey === 0 && version === 0) {
      setPage(initialPage)
      setLoading(false)
      setError(undefined)
      // Static props are public. Fetch only reactions to hydrate the signed-in
      // viewer's hearts, rather than fetching the entire feed again.
      if (user) {
        const contentIds = initialPage.posts.flatMap((post) => [
          post.id,
          ...post.replyPreviews.map((reply) => reply.id),
        ])
        if (!contentIds.length) setReactionViewer(user.id)
        else
          void api(
            'comment-reactions',
            { contentType: 'social_post', contentIds },
            { cache: 'no-store' }
          )
            .then((reactions) => {
              if (current !== generation.current) return
              const personalize = (post: SocialPost): SocialPost => {
                const likes = reactions.filter(
                  (r) => r.content_id === post.id && r.reaction_type === 'like'
                )
                return {
                  ...post,
                  liked:
                    !post.removed && likes.some((r) => r.user_id === user.id),
                  likeCount: post.removed ? 0 : likes.length,
                  replyPreviews: post.replyPreviews.map(personalize),
                }
              }
              setPage({
                ...initialPage,
                posts: initialPage.posts.map(personalize),
              })
              setReactionViewer(user.id)
            })
            .catch(() => {
              if (current === generation.current) void load()
            })
      }
    } else void load()
    return () => {
      generation.current++
    }
  }, [load, refreshKey, version, initialPage])
  useEffect(() => {
    if (parentId || !page.nextCursor || loading || reactionsLoading || error)
      return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void load(page.nextCursor!)
      },
      { rootMargin: '400px' }
    )
    if (sentinel.current) observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [parentId, page.nextCursor, loading, reactionsLoading, error, load])
  const changed = () => {
    setVersion((v) => v + 1)
    onChanged?.()
  }
  return (
    <div aria-busy={loading}>
      {page.posts.map((post, index) => (
        <SocialPostCard
          key={post.id}
          post={post}
          onChanged={changed}
          depth={depth}
          refreshKey={refreshKey + version}
          connectedAbove={depth > 0}
          continueThread={depth > 0 && index < page.posts.length - 1}
          reactionsLoading={reactionsLoading}
        />
      ))}
      {!loading && !error && !page.posts.length && (
        <div className="text-ink-500 px-5 py-10 text-center">
          {parentId
            ? 'No replies yet. Start the conversation.'
            : 'Nothing here yet. Share a thought or a market to get things started.'}
        </div>
      )}
      {error && (
        <div role="alert" className="p-4 text-center">
          <p className="mb-2 text-sm text-red-600">{error.message}</p>
          <Button size="sm" onClick={() => load(error.cursor)}>
            Try again
          </Button>
        </div>
      )}
      {loading && (
        <SocialPostSkeleton count={page.posts.length || parentId ? 1 : 3} />
      )}
      <div ref={sentinel} />
      {page.nextCursor && !loading && !reactionsLoading && !error && (
        <div className="p-4 text-center">
          <Button size="sm" color="gray" onClick={() => load(page.nextCursor!)}>
            Load more
          </Button>
        </div>
      )}
    </div>
  )
}

export function SocialPostSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading posts">
      <span className="sr-only">Loading posts…</span>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="border-ink-200 dark:border-ink-300 flex gap-3 border-b px-4 py-4 motion-safe:animate-pulse"
        >
          <div className="bg-ink-200 h-8 w-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="bg-ink-200 h-3 w-2/5 rounded-full" />
            <div className="bg-ink-100 dark:bg-ink-200 h-3 w-full rounded-full" />
            <div className="bg-ink-100 dark:bg-ink-200 h-3 w-3/4 rounded-full" />
            <div className="border-ink-200 dark:border-ink-300 h-20 rounded-2xl border" />
          </div>
        </div>
      ))}
    </div>
  )
}
