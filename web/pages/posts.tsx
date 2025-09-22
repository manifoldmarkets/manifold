import { PencilIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import { TopLevelPost } from 'common/top-level-post'
import { unauthedApi } from 'common/util/api'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { Button, buttonClass } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { PostCard } from 'web/components/top-level-posts/post-card'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { Title } from 'web/components/widgets/title'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useDefinedSearchParams } from 'web/hooks/use-defined-search-params'
import { useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'

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
  const pathName = usePathname()
  const { searchParams, createQueryString } = useDefinedSearchParams()

  // Map URL filter values to viewType
  const getViewTypeFromFilter = (
    filter: string | null
  ): 'latest' | 'best' | 'changelog' | 'new-comments' => {
    switch (filter) {
      case 'latest':
        return 'latest'
      case 'changelog':
        return 'changelog'
      case 'new-comments':
        return 'new-comments'
      default:
        return 'best'
    }
  }

  // Map viewType to URL filter values
  const getFilterFromViewType = (
    viewType: 'latest' | 'best' | 'changelog' | 'new-comments'
  ): string => {
    return viewType === 'best' ? 'best' : viewType
  }

  const currentFilter = searchParams.get('filter')
  const [viewType, setViewType] = useState<
    'latest' | 'best' | 'changelog' | 'new-comments'
  >(getViewTypeFromFilter(currentFilter))

  useEffect(() => {
    if (!router.isReady) return
    const urlViewType = getViewTypeFromFilter(currentFilter)
    if (viewType !== urlViewType) {
      setViewType(urlViewType)
    }
  }, [router.isReady, currentFilter])

  // cache delivers best posts
  const shouldFetchDifferentPosts = viewType !== 'best'
  const { data: differentPosts, loading } = useAPIGetter(
    'get-posts',
    {
      sortBy:
        viewType === 'new-comments'
          ? 'new-comments'
          : viewType === 'changelog' || viewType === 'latest'
          ? 'created_time'
          : 'importance_score',
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
          <Col className="w-full">
            <Row className="items-center justify-between">
              <Title className="mx-4 !mb-0 sm:mx-0"> Posts</Title>
              {user && (
                <Col className="mr-1 self-end sm:hidden">
                  <Link
                    href={'/create-post'}
                    onClick={() => track('latest posts click create post')}
                    className={clsx(buttonClass('xs', 'indigo'), 'self-end')}
                  >
                    <PencilIcon className="mr-1 h-4 w-4" />
                    New Post
                  </Link>
                </Col>
              )}
            </Row>
            <Row className="mx-4 mt-4 gap-2 sm:mx-0">
              <Button
                size="xs"
                color={viewType === 'best' ? 'indigo' : 'gray-outline'}
                onClick={() => {
                  const newFilter = getFilterFromViewType('best')
                  router.replace(
                    pathName + '?' + createQueryString('filter', newFilter),
                    undefined,
                    { shallow: true }
                  )
                }}
              >
                Best
              </Button>
              <Button
                size="xs"
                color={viewType === 'latest' ? 'indigo' : 'gray-outline'}
                onClick={() => {
                  const newFilter = getFilterFromViewType('latest')
                  router.replace(
                    pathName + '?' + createQueryString('filter', newFilter),
                    undefined,
                    { shallow: true }
                  )
                }}
              >
                New
              </Button>
              <Button
                size="xs"
                className="whitespace-nowrap"
                color={viewType === 'new-comments' ? 'indigo' : 'gray-outline'}
                onClick={() => {
                  const newFilter = getFilterFromViewType('new-comments')
                  router.replace(
                    pathName + '?' + createQueryString('filter', newFilter),
                    undefined,
                    { shallow: true }
                  )
                }}
              >
                New Comments
              </Button>
              <Button
                size="xs"
                color={viewType === 'changelog' ? 'indigo' : 'gray-outline'}
                onClick={() => {
                  const newFilter = getFilterFromViewType('changelog')
                  router.replace(
                    pathName + '?' + createQueryString('filter', newFilter),
                    undefined,
                    { shallow: true }
                  )
                }}
              >
                Changelog
              </Button>
              {user && (
                <Col className="hidden w-full sm:flex">
                  <Link
                    href={'/create-post'}
                    onClick={() => track('latest posts click create post')}
                    className={clsx(buttonClass('xs', 'indigo'), 'self-end')}
                  >
                    <PencilIcon className="mr-1 h-4 w-4" />
                    New Post
                  </Link>
                </Col>
              )}
            </Row>
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
