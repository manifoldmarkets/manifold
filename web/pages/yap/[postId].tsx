import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { ArrowLeftIcon } from '@heroicons/react/outline'
import { SocialPostDetail } from 'common/social-post'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { SocialPostCard } from 'web/components/yap/social-post-card'
import { SocialComposer } from 'web/components/yap/social-composer'
import { SocialPostList } from 'web/components/yap/social-post-list'
import { api } from 'web/lib/api/api'
import { useUser } from 'web/hooks/use-user'
import { Button } from 'web/components/buttons/button'

export default function YapPostPage() {
  const router = useRouter()
  const id =
    typeof router.query.postId === 'string' ? router.query.postId : undefined
  const user = useUser()
  const [detail, setDetail] = useState<SocialPostDetail>()
  const [error, setError] = useState<string>()
  const [version, setVersion] = useState(0)
  const refresh = () => setVersion((v) => v + 1)
  useEffect(() => {
    if (!id) return
    let cancelled = false
    setError(undefined)
    api('get-social-post', { id })
      .then((result) => {
        if (!cancelled) setDetail(result)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [id, user?.id, version])
  const current = detail?.post.id === id ? detail : undefined
  return (
    <Page trackPageView="yap post page">
      <SEO
        title="Post on Yap"
        description="Join the conversation on Manifold."
        url={`/yap/${id ?? ''}`}
      />
      <section
        aria-label="Yap"
        className="border-ink-100 mx-auto w-full max-w-2xl border-x"
      >
        <header className="border-ink-100 border-b px-4 py-4">
          <Link
            href="/yap"
            className="text-ink-900 flex items-center gap-3 text-lg font-semibold"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            Yap
          </Link>
        </header>
        {error ? (
          <div role="alert" className="p-5">
            <p>{error}</p>
            <Button onClick={refresh} color="gray" size="sm">
              Try again
            </Button>
          </div>
        ) : current ? (
          <>
            {current.ancestors.map((post) => (
              <SocialPostCard
                key={post.id}
                post={post}
                onChanged={refresh}
                previews={false}
                refreshKey={version}
              />
            ))}
            <SocialPostCard
              key={current.post.id}
              post={current.post}
              onChanged={refresh}
              previews={false}
              refreshKey={version}
              showReplyActions={false}
            />
            {current.post.canReply ? (
              <SocialComposer
                key={`reply-${id}`}
                parentId={id}
                onPosted={refresh}
              />
            ) : (
              <p className="text-ink-500 p-4 text-sm">
                This post is closed to new replies.
              </p>
            )}
            <h2 className="border-ink-100 border-y px-4 py-3 font-semibold">
              Replies
            </h2>
            <SocialPostList
              key={id}
              parentId={id}
              refreshKey={version}
              onChanged={refresh}
            />
          </>
        ) : (
          <p className="text-ink-400 p-5">Loading…</p>
        )}
      </section>
    </Page>
  )
}
