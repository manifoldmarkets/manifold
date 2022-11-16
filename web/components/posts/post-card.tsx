import clsx from 'clsx'
import { Post } from 'common/post'
import Link from 'next/link'
import { postPath } from 'web/lib/firebase/posts'
import { fromNow } from 'web/lib/util/time'
import { Avatar } from '../widgets/avatar'
import { Card } from '../widgets/card'
import { CardHighlightOptions } from '../contract/contracts-grid'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { UserLink } from '../widgets/user-link'
import { track } from 'web/lib/service/analytics'
import { useEffect, useState } from 'react'
import { FeaturedPill } from '../contract/contract-card'

export function PostCard(props: {
  post: Post
  onPostClick?: (post: Post) => void
  highlightOptions?: CardHighlightOptions
  pinned?: boolean
}) {
  const { post, onPostClick, highlightOptions, pinned } = props
  const { itemIds: itemIds, highlightClassName } = highlightOptions || {}

  return (
    <Card
      className={clsx(
        'group relative flex gap-2 py-2 px-4',
        itemIds?.includes(post.id) && highlightClassName
      )}
    >
      <Col className="w-full gap-1">
        <Row className="items-center justify-between">
          <Row className="items-center gap-2 text-sm">
            <Avatar
              username={post.creatorUsername}
              avatarUrl={post.creatorAvatarUrl}
              size={4}
            />
            <UserLink
              className="text-sm text-gray-400"
              name={post.creatorName}
              username={post.creatorUsername}
            />
            <span className="mx-1 text-gray-400">•</span>
            <span className="text-gray-400">{fromNow(post.createdTime)}</span>
          </Row>
          {pinned && <FeaturedPill label={post.featuredLabel} />}
        </Row>
        <div className="text-md mb-1 font-medium text-gray-900 transition-all">
          {post.title}
        </div>
        <div className="break-words text-sm text-gray-600">{post.subtitle}</div>
        <Row className="gap-2 pt-1">
          <Row className="gap-1 text-sm text-gray-400">
            <div className="font-semibold">{post.commentCount ?? 0}</div>
            <div className="font-normal">comments</div>
          </Row>
        </Row>
      </Col>
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
        <Link
          href={postPath(post.slug)}
          onClick={() => {
            track('select post card'),
              {
                slug: post.slug,
                postId: post.id,
              }
          }}
          className="absolute top-0 left-0 right-0 bottom-0"
        />
      )}
    </Card>
  )
}

export function PostCardList(props: {
  posts: Post[]
  highlightOptions?: CardHighlightOptions
  onPostClick?: (post: Post) => void
  limit?: number
}) {
  const { posts, onPostClick, highlightOptions, limit } = props

  const [shownPosts, setShownPosts] = useState<Post[]>(posts)
  useEffect(() => {
    if (limit && limit != 0) {
      setShownPosts(posts.slice(0, limit))
    } else {
      setShownPosts(posts)
    }
  }, [posts, limit])

  return (
    <div className="w-full">
      {shownPosts.map((post) => (
        <div className="mb-1" key={post.id}>
          <PostCard
            key={post.id}
            post={post}
            onPostClick={onPostClick}
            highlightOptions={highlightOptions}
          />
        </div>
      ))}
      {limit && limit != 0 && posts.length > limit && (
        <div className="flex justify-center">
          <button
            className="text-sm font-semibold text-indigo-700"
            onClick={() => setShownPosts(posts)}
          >
            Show all
          </button>
        </div>
      )}
    </div>
  )
}
