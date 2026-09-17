import { useCallback, useEffect, useRef, useState } from 'react'
import { SocialPostPage } from 'common/social-post'
import { api } from 'web/lib/api/api'
import { useUser } from 'web/hooks/use-user'
import { Button } from '../buttons/button'
import { SocialPostCard } from './social-post-card'

export function SocialPostList({
  parentId,
  refreshKey = 0,
  depth = 0,
  onChanged,
}: {
  parentId?: string
  refreshKey?: number
  depth?: number
  onChanged?: () => void
}) {
  const user = useUser()
  const [page, setPage] = useState<SocialPostPage>({
    posts: [],
    nextCursor: null,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<{ message: string; cursor?: string }>()
  const [version, setVersion] = useState(0)
  const sentinel = useRef<HTMLDivElement>(null)
  const generation = useRef(0)
  const pending = useRef(false)
  const pageRef = useRef(page)
  useEffect(() => {
    pageRef.current = { posts: [], nextCursor: null }
    setPage(pageRef.current)
  }, [parentId, user?.id])
  const load = useCallback(
    async (cursor?: string) => {
      if (!user || pending.current) return
      const current = generation.current
      pending.current = true
      setLoading(true)
      setError(undefined)
      try {
        let next = await api('get-social-posts', {
          parentId,
          cursor,
          limit: 30,
          useCache:
            !parentId && !cursor && refreshKey === 0 && version === 0
              ? 'true'
              : 'false',
        })
        if (current !== generation.current) return
        // Refresh every loaded reply page before updating so drafts on later
        // replies stay mounted. A failed refresh leaves the whole list intact.
        if (parentId && !cursor) {
          const loadedCount = pageRef.current.posts.length
          while (next.nextCursor && next.posts.length < loadedCount) {
            const more = await api('get-social-posts', {
              parentId,
              cursor: next.nextCursor,
              limit: 30,
              useCache: 'false',
            })
            if (current !== generation.current) return
            next = {
              posts: [...next.posts, ...more.posts],
              nextCursor: more.nextCursor,
            }
          }
        }
        if (cursor) {
          const previous = pageRef.current
          const previousIds = new Set(previous.posts.map((post) => post.id))
          next = {
            nextCursor: next.nextCursor,
            posts: [
              ...previous.posts,
              ...next.posts.filter((post) => !previousIds.has(post.id)),
            ],
          }
        }
        pageRef.current = next
        setPage(next)
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
    [parentId, user?.id, refreshKey, version]
  )
  useEffect(() => {
    generation.current++
    pending.current = false
    void load()
    return () => {
      generation.current++
    }
  }, [load])
  useEffect(() => {
    if (parentId || !page.nextCursor || loading || error) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void load(page.nextCursor!)
      },
      { rootMargin: '400px' }
    )
    if (sentinel.current) observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [parentId, page.nextCursor, loading, error, load])
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
      {page.nextCursor && !loading && !error && (
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
