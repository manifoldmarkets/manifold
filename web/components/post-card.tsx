import { track } from '@amplitude/analytics-browser'
import { DocumentIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Post } from 'common/post'
import Link from 'next/link'
import { postPath } from 'web/lib/firebase/posts'
import { fromNow } from 'web/lib/util/time'
import { Avatar } from './avatar'
import { Card } from './card'
import { CardHighlightOptions } from './contract/contracts-grid'
import { UserLink } from './user-link'

export function PostCard(props: {
  post: Post
  onPostClick?: (post: Post) => void
  highlightOptions?: CardHighlightOptions
}) {
  const { post, onPostClick, highlightOptions } = props
  const { itemIds: itemIds, highlightClassName } = highlightOptions || {}

  return (
    <div className="relative py-1">
      <Card
        className={clsx(
          'relative flex gap-3 py-2 px-3',
          itemIds?.includes(post.id) && highlightClassName
        )}
      >
        <div className="flex-shrink-0">
          <Avatar className="h-12 w-12" username={post.creatorUsername} />
        </div>
        <div className="">
          <div className="text-sm text-gray-500">
            <UserLink
              className="text-neutral"
              name={post.creatorName}
              username={post.creatorUsername}
            />
            <span className="mx-1">•</span>
            <span className="text-gray-500">{fromNow(post.createdTime)}</span>
          </div>
          <div className=" break-words text-lg font-medium  text-gray-900">
            {post.title}
          </div>
          <div className="font-small  text-md  break-words text-gray-500">
            {post.subtitle}
          </div>
        </div>
        <div>
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-indigo-300 px-2 py-0.5 text-xs font-medium text-white">
            <DocumentIcon className={'h3 w-3'} />
            Post
          </span>
        </div>
      </Card>
      {onPostClick ? (
        <a
          className="absolute top-0 left-0 right-0 bottom-0"
          onClick={(e) => {
            // Let the browser handle the link click (opens in new tab).
            if (e.ctrlKey || e.metaKey) return

            e.preventDefault()
            track('select post card'),
              {
                slug: post.slug,
                postId: post.id,
              }
            onPostClick(post)
          }}
        />
      ) : (
        <Link href={postPath(post.slug)}>
          <a
            onClick={() => {
              track('select post card'),
                {
                  slug: post.slug,
                  postId: post.id,
                }
            }}
            className="absolute top-0 left-0 right-0 bottom-0"
          />
        </Link>
      )}
    </div>
  )
}

export function PostCardList(props: {
  posts: Post[]
  highlightOptions?: CardHighlightOptions
  onPostClick?: (post: Post) => void
}) {
  const { posts, onPostClick, highlightOptions } = props
  return (
    <div className="w-full">
      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          onPostClick={onPostClick}
          highlightOptions={highlightOptions}
        />
      ))}
    </div>
  )
}
