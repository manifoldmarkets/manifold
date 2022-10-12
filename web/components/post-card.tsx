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
import { Row } from './layout/row'
import { UserLink } from './user-link'

export function PostCard(props: {
  post: Post
  onPostClick?: (post: Post) => void
  highlightOptions?: CardHighlightOptions
}) {
  const { post, onPostClick, highlightOptions } = props
  const { itemIds: itemIds, highlightClassName } = highlightOptions || {}

  return (
    <Card
      className={clsx(
        'group relative flex gap-3 py-2 px-3',
        itemIds?.includes(post.id) && highlightClassName
      )}
    >
      <Row className="flex grow  justify-between">
        <div className="">
          <Row className="items-center text-sm ">
            <Avatar className="mx-1 h-7 w-7" username={post.creatorUsername} />
            <UserLink
              className=" text-gray-400"
              name={post.creatorName}
              username={post.creatorUsername}
            />
            <span className="mx-1 text-gray-400">•</span>
            <span className="text-gray-400">{fromNow(post.createdTime)}</span>
          </Row>
          <div className=" break-words text-lg font-semibold  text-indigo-700 group-hover:underline group-hover:decoration-indigo-400 group-hover:decoration-2">
            {post.title}
          </div>
          <div className="font-small  text-md  break-words text-indigo-400">
            {post.subtitle}
          </div>
        </div>
        <div>
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-indigo-300 px-2 py-0.5 text-xs font-medium text-white">
            <DocumentIcon className={'h3 w-3'} />
            Post
          </span>
        </div>
      </Row>
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
    </Card>
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
