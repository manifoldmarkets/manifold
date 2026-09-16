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
  const [error, setError] = useState<string>()
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
        if (current === generation.current) setError((e as Error).message)
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
    void load()
    return () => {
      generation.current++
    }
  }, [load, refreshKey, version])
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
      {page.posts.map((post) => (
        <SocialPostCard
          key={post.id}
          post={post}
          onChanged={changed}
          depth={depth}
          refreshKey={refreshKey + version}
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
          <p className="mb-2 text-sm text-red-600">{error}</p>
          <Button
            size="sm"
            onClick={() =>
              load(page.posts.length ? page.nextCursor ?? undefined : undefined)
            }
          >
            Try again
          </Button>
        </div>
      )}
      {loading && <p className="text-ink-400 p-5 text-center">Loading…</p>}
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
