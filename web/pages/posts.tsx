import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { TopLevelPost } from 'common/top-level-post'
import { PostCard } from 'web/components/top-level-posts/post-card'
import { useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { buttonClass } from 'web/components/buttons/button'
import Link from 'next/link'
import { useState, useEffect } from 'react'
import { Button } from 'web/components/buttons/button'
import { unauthedApi } from 'common/util/api'
import { useRouter } from 'next/router'
import { useAPIGetter } from 'web/hooks/use-api-getter'

export async function getStaticProps() {
  const bestPosts = await unauthedApi('get-posts', {
    sortBy: 'importance_score',
  })
  return {
    props: {
      bestPosts,
    },
    revalidate: 60, // Revalidate every minute
  }
}

export default function PostsPage(props: { bestPosts: TopLevelPost[] }) {
  const { bestPosts } = props
  const user = useUser()
  const router = useRouter()

  const [viewType, setViewType] = useState<'latest' | 'best' | 'changelog'>(
    'best'
  )

  useEffect(() => {
    if (!router.isReady) return
    const filter = router.query.filter as string | undefined
    if (filter === 'changelog') {
      if (viewType !== 'changelog') setViewType('changelog')
    } else if (viewType === 'changelog' && !filter) {
      setViewType('best')
    }
  }, [router.isReady, router.query.filter, viewType])

  const shouldFetchDifferentPosts =
    viewType === 'latest' || viewType === 'changelog'
  const { data: differentPosts, loading } = useAPIGetter(
    'get-posts',
    {
      sortBy: 'created_time',
      isChangeLog: viewType === 'changelog',
    },
    undefined,
    undefined,
    router.isReady && shouldFetchDifferentPosts
  )

  const posts = viewType === 'best' ? bestPosts : differentPosts
  return (
    <Page trackPageView={'posts page'}>
      <Col className=" px-2 py-3">
        <Row className="my-4 items-start justify-between sm:mt-0">
          <Col>
            <Title className="mx-4 !mb-0 sm:mx-0">
              {viewType === 'latest'
                ? 'Latest Posts'
                : viewType === 'best'
                ? 'Best Posts'
                : 'Changelog Posts'}
            </Title>
            <Row className="mx-4 mt-2 gap-2 sm:mx-0">
              <Button
                size="xs"
                color={viewType === 'best' ? 'indigo' : 'gray-outline'}
                onClick={() => {
                  setViewType('best')
                  router.push('/posts', undefined, { shallow: true })
                }}
              >
                Best
              </Button>
              <Button
                size="xs"
                color={viewType === 'latest' ? 'indigo' : 'gray-outline'}
                onClick={() => {
                  setViewType('latest')
                  router.push('/posts', undefined, { shallow: true })
                }}
              >
                Latest
              </Button>
              <Button
                size="xs"
                color={viewType === 'changelog' ? 'indigo' : 'gray-outline'}
                onClick={() => {
                  setViewType('changelog')
                  router.push('/posts?filter=changelog', undefined, {
                    shallow: true,
                  })
                }}
              >
                Changelog
              </Button>
            </Row>
          </Col>
          <Col>
            {user && (
              <Link
                href={'/create-post'}
                onClick={() => track('latest posts click create post')}
                className={buttonClass('md', 'indigo')}
              >
                Create Post
              </Link>
            )}
          </Col>
        </Row>
        {loading ? <LoadingIndicator /> : <Posts posts={posts ?? []} />}
        {!loading && posts && posts.length === 0 && (
          <Col className="items-center justify-center py-4 text-gray-500">
            No posts found.
          </Col>
        )}
      </Col>
    </Page>
  )
}

export function Posts(props: { posts: TopLevelPost[] }) {
  const { posts } = props
  return (
    <Col className="gap-2">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </Col>
  )
}
