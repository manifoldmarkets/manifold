import {
  ChatAlt2Icon,
  ChatIcon,
  ClockIcon,
  PencilIcon,
  SparklesIcon,
  TrendingUpIcon,
} from '@heroicons/react/outline'
import clsx from 'clsx'
import { TopLevelPost } from 'common/top-level-post'
import { unauthedApi } from 'common/util/api'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { buttonClass } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { PostCard } from 'web/components/top-level-posts/post-card'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
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
    revalidate: 60,
  }
}

type ViewType = 'best' | 'latest' | 'new-comments' | 'changelog'

const FILTER_OPTIONS: {
  id: ViewType
  label: string
  icon: typeof FireIcon
  description: string
}[] = [
  {
    id: 'best',
    label: 'Best',
    icon: TrendingUpIcon,
    description: 'Top posts by engagement',
  },
  {
    id: 'latest',
    label: 'New',
    icon: SparklesIcon,
    description: 'Most recently published',
  },
  {
    id: 'new-comments',
    label: 'Active',
    icon: ChatAlt2Icon,
    description: 'Recent comments',
  },
  {
    id: 'changelog',
    label: 'Changelog',
    icon: ClockIcon,
    description: 'Product updates',
  },
]

export default function PostsPage(props: { bestPosts: TopLevelPost[] }) {
  const { bestPosts } = props
  const user = useUser()
  const router = useRouter()
  const pathName = usePathname()
  const { searchParams, createQueryString } = useDefinedSearchParams()

  const getViewTypeFromFilter = (filter: string | null): ViewType => {
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

  const getFilterFromViewType = (viewType: ViewType): string => {
    return viewType === 'best' ? 'best' : viewType
  }

  const currentFilter = searchParams.get('filter')
  const [viewType, setViewType] = useState<ViewType>(
    getViewTypeFromFilter(currentFilter)
  )

  useEffect(() => {
    if (!router.isReady) return
    const urlViewType = getViewTypeFromFilter(currentFilter)
    if (viewType !== urlViewType) {
      setViewType(urlViewType)
    }
  }, [router.isReady, currentFilter])

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

  const handleFilterChange = (newViewType: ViewType) => {
    const newFilter = getFilterFromViewType(newViewType)
    router.replace(
      pathName + '?' + createQueryString('filter', newFilter),
      undefined,
      { shallow: true }
    )
  }

  return (
    <Page trackPageView={'posts page'}>
      <Col className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        {/* Header Section */}
        <header className="mb-8">
          <Row className="items-start justify-between gap-4">
            <Col className="gap-2">
              <Row className="items-center gap-3">
                <div className="from-primary-500 to-primary-600 shadow-primary-500/25 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg">
                  <ChatIcon className="h-5 w-5 text-white" />
                </div>
                <h1 className="text-ink-900 text-2xl font-bold tracking-tight sm:text-3xl">
                  Forum
                </h1>
              </Row>
              <p className="text-ink-500 text-sm sm:text-base">
                Community discussions, updates, and announcements
              </p>
            </Col>

            {user && (
              <Link
                href="/create-post"
                onClick={() => track('latest posts click create post')}
                className={clsx(
                  buttonClass('sm', 'indigo'),
                  'shadow-primary-500/25 flex-shrink-0 shadow-lg'
                )}
              >
                <PencilIcon className="mr-2 h-4 w-4" />
                New Post
              </Link>
            )}
          </Row>
        </header>

        {/* Filter Pills */}
        <nav className="mb-6">
          <Row className="bg-canvas-50 dark:bg-canvas-0 scrollbar-hide -mx-4 gap-2 overflow-x-auto rounded-xl p-1.5 sm:mx-0 sm:gap-1">
            {FILTER_OPTIONS.map((option) => {
              const isActive = viewType === option.id
              const Icon = option.icon
              return (
                <button
                  key={option.id}
                  onClick={() => handleFilterChange(option.id)}
                  className={clsx(
                    'flex flex-shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-canvas-0 dark:bg-ink-200 text-primary-600 shadow-sm dark:text-white'
                      : 'text-ink-500 hover:text-ink-700 dark:hover:text-ink-600 hover:bg-canvas-0/50'
                  )}
                >
                  <Icon
                    className={clsx(
                      'h-4 w-4 transition-colors',
                      isActive
                        ? 'text-primary-500 dark:text-white'
                        : 'text-ink-400 dark:text-ink-500 group-hover:text-ink-500 dark:group-hover:text-ink-600'
                    )}
                  />
                  <span>{option.label}</span>
                </button>
              )
            })}
          </Row>
        </nav>

        {/* Posts List */}
        <main>
          {loading ? (
            <Col className="items-center justify-center py-16">
              <LoadingIndicator size="lg" />
              <p className="text-ink-500 mt-4 text-sm">Loading posts...</p>
            </Col>
          ) : posts && posts.length > 0 ? (
            <Posts posts={posts} />
          ) : (
            <EmptyState viewType={viewType} />
          )}
        </main>
      </Col>
    </Page>
  )
}

function Posts(props: { posts: TopLevelPost[] }) {
  const { posts } = props

  // Feature the first post if it's the "best" view
  const [featured, ...rest] = posts

  return (
    <Col className="gap-4">
      {/* Featured post */}
      {featured && (
        <div className="animate-fade-in">
          <PostCard post={featured} featured />
        </div>
      )}

      {/* Rest of posts */}
      <div className="space-y-3">
        {rest.map((post, index) => (
          <div
            key={post.id}
            className="animate-fade-in"
            style={{ animationDelay: `${(index + 1) * 50}ms` }}
          >
            <PostCard post={post} />
          </div>
        ))}
      </div>
    </Col>
  )
}

function EmptyState(props: { viewType: ViewType }) {
  const { viewType } = props
  const user = useUser()

  const emptyMessages: Record<
    ViewType,
    { title: string; description: string }
  > = {
    best: {
      title: 'No posts yet',
      description: 'Be the first to share something with the community.',
    },
    latest: {
      title: 'No new posts',
      description: 'Check back later for fresh content.',
    },
    'new-comments': {
      title: 'No recent activity',
      description: 'Posts with new comments will appear here.',
    },
    changelog: {
      title: 'No changelog entries',
      description: 'Product updates will be posted here.',
    },
  }

  const message = emptyMessages[viewType]

  return (
    <Col className="border-ink-200 dark:border-ink-300 items-center justify-center rounded-2xl border-2 border-dashed py-16">
      <div className="bg-ink-100 dark:bg-ink-200 mb-4 flex h-14 w-14 items-center justify-center rounded-full">
        <ChatIcon className="text-ink-400 h-7 w-7" />
      </div>
      <h3 className="text-ink-900 text-lg font-semibold">{message.title}</h3>
      <p className="text-ink-500 mt-1 text-center text-sm">
        {message.description}
      </p>
      {user && viewType !== 'changelog' && (
        <Link
          href="/create-post"
          className={clsx(buttonClass('sm', 'indigo'), 'mt-6')}
        >
          <PencilIcon className="mr-2 h-4 w-4" />
          Create a Post
        </Link>
      )}
    </Col>
  )
}
