import clsx from 'clsx'
import { UserIcon } from '@heroicons/react/solid'
import { groupPath } from 'common/group'
import { TopLevelPost } from 'common/top-level-post'
import { isUserLikelySpammer } from 'common/user'
import { removeEmojis } from 'common/util/string'
import Link from 'next/link'
import { ReactNode } from 'react'
import { UserResults } from 'web/components/search/user-results'
import { BrowseTopicPills } from 'web/components/topics/browse-topic-pills'
import { Avatar } from 'web/components/widgets/avatar'
import { isBlocked, usePrivateUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'
import { useBrowseTopics } from './browse-topics'
import { useSearchResults } from './use-search-results'

export type SearchCategory = 'all' | 'markets' | 'users' | 'topics' | 'posts'
const CATEGORIES: { key: SearchCategory; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'markets', label: 'Markets' },
  { key: 'users', label: 'Users' },
  { key: 'topics', label: 'Topics' },
  { key: 'posts', label: 'Posts' },
]
const PAGE_SIZE = 20

export function SearchTabs(props: {
  category: SearchCategory
  onCategory: (category: SearchCategory) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Search categories"
      className="flex shrink-0 items-center gap-0.5"
    >
      {CATEGORIES.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={props.category === key}
          onClick={() => props.onCategory(key)}
          className={clsx(
            'shrink-0 rounded-full px-2 py-1 text-xs font-medium transition-colors',
            props.category === key
              ? 'bg-ink-900 text-canvas-0'
              : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export function SearchResults(props: {
  term: string
  category: SearchCategory
  onCategory: (category: SearchCategory) => void
}) {
  const { term, category, onCategory } = props
  const privateUser = usePrivateUser()
  const topics = useBrowseTopics()
  const users = useSearchResults(term, PAGE_SIZE, (term, offset, signal) =>
    api(
      'search-users',
      { term, limit: PAGE_SIZE, page: offset / PAGE_SIZE },
      { signal }
    )
  )
  const groups = useSearchResults(
    term,
    PAGE_SIZE,
    async (term, offset, signal) =>
      (
        await api(
          'search-groups',
          { term, limit: PAGE_SIZE, offset, type: 'lite' },
          { signal }
        )
      ).lite
  )
  const posts = useSearchResults(term, PAGE_SIZE, (term, offset, signal) =>
    api(
      'get-posts',
      { term, limit: PAGE_SIZE, offset, sortBy: 'importance_score' },
      { signal }
    )
  )
  const visibleUsers = users.items.filter((u) => !isBlocked(privateUser, u.id))
  const nonSpamUsers = visibleUsers.filter(
    (u) => !isUserLikelySpammer(u, !!u.lastBetTime, false)
  )
  const previewUsers = nonSpamUsers.length ? nonSpamUsers : visibleUsers
  const visibleGroups = groups.items.filter((g) => !topics.isHidden(g.slug))
  const visiblePosts = posts.items.filter(
    (p) => !isBlocked(privateUser, p.creatorId)
  )
  const all = category === 'all'

  return (
    <>
      {(all || category === 'users') && (
        <SearchSection
          label="Users"
          state={users}
          count={visibleUsers.length}
          preview={all}
          previewSize={2}
          showAll={() => onCategory('users')}
        >
          {all ? (
            <div className="flex min-w-0 items-center gap-1 overflow-hidden">
              {previewUsers.slice(0, 4).map((u, i) => (
                <Link
                  key={u.id}
                  href={`/${u.username}`}
                  title={u.username}
                  className={clsx(
                    'bg-ink-200 hover:bg-ink-300 flex h-7 min-w-0 flex-1 items-center gap-1 rounded-full pl-1 pr-2 text-xs sm:max-w-[12rem] sm:flex-initial',
                    i >= 2 && 'hidden sm:flex'
                  )}
                >
                  <Avatar
                    username={u.username}
                    avatarUrl={u.avatarUrl}
                    size="2xs"
                    noLink
                  />
                  <span className="truncate">{u.username}</span>
                </Link>
              ))}
            </div>
          ) : (
            <UserResults
              key={term}
              userResults={visibleUsers}
              showHeading={false}
              initialShown={visibleUsers.length}
            />
          )}
        </SearchSection>
      )}
      {(all || category === 'topics') && (
        <SearchSection
          label="Topics"
          state={groups}
          count={visibleGroups.length}
          preview={all}
          previewSize={2}
          showAll={() => onCategory('topics')}
        >
          {all ? (
            <div className="flex min-w-0 items-center gap-1 overflow-hidden">
              {visibleGroups.slice(0, 4).map((g, i) => (
                <Link
                  key={g.id}
                  href={groupPath(g.slug)}
                  prefetch={false}
                  title={removeEmojis(g.name)}
                  className={clsx(
                    'bg-canvas-50 hover:bg-primary-50 text-ink-600 hover:text-primary-700 flex h-7 min-w-0 flex-1 items-center rounded-md px-2 text-xs sm:max-w-[12rem] sm:flex-initial',
                    i >= 2 && 'hidden sm:flex'
                  )}
                >
                  <span className="truncate">{removeEmojis(g.name)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <BrowseTopicPills
              key={term}
              topics={visibleGroups}
              initialShown={visibleGroups.length}
            />
          )}
        </SearchSection>
      )}
      {(all || category === 'posts') && (
        <SearchSection
          label="Posts"
          state={posts}
          count={visiblePosts.length}
          preview={all}
          previewSize={2}
          showAll={() => onCategory('posts')}
        >
          <div className="min-w-0">
            {(all ? visiblePosts.slice(0, 2) : visiblePosts).map((post) => (
              <SearchPostRow key={post.id} post={post} preview={all} />
            ))}
          </div>
        </SearchSection>
      )}
    </>
  )
}

function SearchPostRow(props: { post: TopLevelPost; preview: boolean }) {
  const { post, preview } = props
  return (
    <Link
      href={`/post/${post.slug}`}
      title={post.title}
      onClick={() =>
        track('click browse post', { slug: post.slug, postId: post.id })
      }
      className={clsx(
        'hover:bg-primary-100 focus-visible:bg-primary-100 flex min-w-0 items-center gap-2 rounded-md text-sm',
        preview ? 'h-7' : 'px-2 py-2'
      )}
    >
      {!preview && (
        <Avatar
          username={post.creatorUsername}
          avatarUrl={post.creatorAvatarUrl}
          size="2xs"
          noLink
        />
      )}
      <span
        className={clsx(
          'min-w-0 flex-1',
          preview ? 'truncate' : 'line-clamp-2'
        )}
      >
        {post.title}
      </span>
      {!preview && post.uniqueUsers != null && (
        <span
          className="text-ink-500 flex shrink-0 items-center gap-1 text-xs"
          aria-label={`${post.uniqueUsers} users commented or reacted`}
        >
          <UserIcon className="h-3 w-3" />
          {post.uniqueUsers}
        </span>
      )}
    </Link>
  )
}

function SearchSection(props: {
  label: string
  state: {
    loading: boolean
    error: boolean
    hasMore: boolean
    loadMore: () => Promise<void>
  }
  count: number
  preview: boolean
  previewSize: number
  showAll: () => void
  children: ReactNode
}) {
  const { label, state, count, preview, previewSize, showAll, children } = props
  // Empty categories don't consume space in the mixed results. Keep a way
  // to continue if the first page was entirely hidden by personal blocks.
  if (preview && !count && !state.loading && !state.error && !state.hasMore)
    return null
  return (
    <section
      aria-label={`${label} results`}
      className={clsx(
        preview
          ? 'grid grid-cols-[3rem_minmax(0,1fr)_auto] items-start gap-x-2'
          : 'flex flex-col gap-1'
      )}
    >
      <h3
        className={clsx(
          'text-ink-700 text-xs font-semibold',
          preview && 'col-start-1 row-start-1 leading-7'
        )}
      >
        {label}
      </h3>
      {preview && (count > previewSize || state.hasMore) && (
        <button
          type="button"
          onClick={showAll}
          aria-label={`See all ${label.toLowerCase()}`}
          className="text-primary-700 col-start-3 row-start-1 text-xs leading-7"
        >
          More
        </button>
      )}
      <div className={clsx('min-w-0', preview && 'col-start-2 row-start-1')}>
        {count > 0 && children}
        {state.loading && (
          <p role="status" className="text-ink-500 py-1 text-sm">
            Loading {label.toLowerCase()}…
          </p>
        )}
        {state.error ? (
          <p role="status" className="text-ink-500 text-sm">
            Couldn't load {label.toLowerCase()}.{' '}
            <button
              type="button"
              onClick={state.loadMore}
              className="text-primary-700"
            >
              Try again
            </button>
          </p>
        ) : !state.loading && !count ? (
          <p className="text-ink-500 text-sm">
            No {label.toLowerCase()} found.
          </p>
        ) : null}
        {!preview && state.hasMore && !state.loading && !state.error && (
          <button
            type="button"
            onClick={state.loadMore}
            className="text-primary-700 self-start py-2 text-sm"
          >
            Load more {label.toLowerCase()}
          </button>
        )}
      </div>
    </section>
  )
}
