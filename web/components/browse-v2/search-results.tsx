import clsx from 'clsx'
import { ReactNode } from 'react'
import { PostRow } from 'web/components/posts/post-row'
import { UserResults } from 'web/components/search/user-results'
import { BrowseTopicPills } from 'web/components/topics/browse-topic-pills'
import { isBlocked, usePrivateUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
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
          previewSize={4}
          showAll={() => onCategory('users')}
        >
          <UserResults
            key={term}
            userResults={all ? visibleUsers.slice(0, 4) : visibleUsers}
            showHeading={false}
            initialShown={visibleUsers.length}
          />
        </SearchSection>
      )}
      {(all || category === 'topics') && (
        <SearchSection
          label="Topics"
          state={groups}
          count={visibleGroups.length}
          preview={all}
          previewSize={4}
          showAll={() => onCategory('topics')}
        >
          <BrowseTopicPills
            key={term}
            topics={all ? visibleGroups.slice(0, 4) : visibleGroups}
            initialShown={visibleGroups.length}
          />
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
          {(all ? visiblePosts.slice(0, 2) : visiblePosts).map((post) => (
            <PostRow key={post.id} post={post} />
          ))}
        </SearchSection>
      )}
    </>
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
    <section aria-label={`${label} results`} className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <h3 className="text-ink-700 font-semibold">{label}</h3>
        {preview && (count > previewSize || state.hasMore) && (
          <button type="button" onClick={showAll} className="text-primary-700">
            See all {label.toLowerCase()}
          </button>
        )}
      </div>
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
        <p className="text-ink-500 text-sm">No {label.toLowerCase()} found.</p>
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
    </section>
  )
}
