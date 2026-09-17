import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { ArrowLeftIcon } from '@heroicons/react/outline'
import { SocialPostDetail } from 'common/social-post'
import { Page } from 'web/components/layout/page'
import { SEO } from 'web/components/SEO'
import { SocialPostCard } from 'web/components/yap/social-post-card'
import { SocialComposer } from 'web/components/yap/social-composer'
import {
  SocialPostList,
  SocialPostSkeleton,
} from 'web/components/yap/social-post-list'
import { api } from 'web/lib/api/api'
import { useIsAuthorized, usePrivateUser, useUser } from 'web/hooks/use-user'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { Button } from 'web/components/buttons/button'

export default function YapPostPage() {
  useRedirectIfSignedOut()
  const isAuthorized = useIsAuthorized()
  const router = useRouter()
  const id =
    typeof router.query.postId === 'string' ? router.query.postId : undefined
  const user = useUser()
  const privateUser = usePrivateUser()
  const viewerKey = JSON.stringify([
    user?.id,
    privateUser?.blockedUserIds,
    privateUser?.blockedByUserIds,
  ])
  const [detail, setDetail] = useState<
    SocialPostDetail & { viewerKey: string }
  >()
  const [error, setError] = useState<string>()
  const [version, setVersion] = useState(0)
  const refresh = () => setVersion((v) => v + 1)
  useEffect(() => {
    setDetail(undefined)
    if (!id || !isAuthorized || !user) return
    let cancelled = false
    setError(undefined)
    api('get-social-post', { id })
      .then((result) => {
        if (!cancelled) setDetail({ ...result, viewerKey })
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [id, viewerKey, isAuthorized, version])
  const current =
    detail && detail.post.id === id && detail.viewerKey === viewerKey
      ? detail
      : undefined
  return (
    <Page trackPageView="yap post page" hideFooter>
      <SEO
        title="Post on Yap"
        description="Join the conversation on Manifold."
        url={`/yap/${id ?? ''}`}
      />
      <section
        aria-label="Yap"
        className="border-ink-200 dark:border-ink-300 mx-auto min-h-screen w-full max-w-2xl border-x"
      >
        <header className="bg-canvas-0/95 border-ink-200 dark:border-ink-300 sticky top-0 z-10 border-b px-4 py-4 backdrop-blur-md">
          <Link
            href="/yap"
            className="text-ink-900 flex items-center gap-3 text-lg font-semibold"
          >
            <ArrowLeftIcon className="h-5 w-5" />
            Yap
          </Link>
        </header>
        {!isAuthorized || !user ? (
          <SocialPostSkeleton />
        ) : error ? (
          <div role="alert" className="p-5">
            <p>{error}</p>
            <Button onClick={refresh} color="gray" size="sm">
              Try again
            </Button>
          </div>
        ) : current ? (
          <>
            {current.ancestors.map((post, index) => (
              <SocialPostCard
                key={post.id}
                post={post}
                onChanged={refresh}
                previews={false}
                refreshKey={version}
                connectedAbove={index > 0}
                continueThread
              />
            ))}
            <SocialPostCard
              key={current.post.id}
              post={current.post}
              onChanged={refresh}
              previews={false}
              refreshKey={version}
              showReplyActions={false}
              connectedAbove={current.ancestors.length > 0}
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
            <h2 className="border-ink-200 dark:border-ink-300 border-y px-4 py-3 font-semibold">
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
          <SocialPostSkeleton />
        )}
      </section>
    </Page>
  )
}
