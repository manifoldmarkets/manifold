import clsx from 'clsx'
import { Post } from 'common/post'
import Link from 'next/link'
import { postPath } from 'web/lib/supabase/post'
import { fromNow } from 'web/lib/util/time'
import { Avatar } from '../widgets/avatar'
import { Card } from '../widgets/card'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { UserLink } from '../widgets/user-link'
import { track } from 'web/lib/service/analytics'
import { useEffect, useState } from 'react'
import { richTextToString } from 'common/util/parse'
import { Linkify } from '../widgets/linkify'

export function PostCard(props: {
  post: Post
  onPostClick?: (post: Post) => void
  highlight?: boolean
}) {
  const { post, onPostClick, highlight } = props

  return (
    <Card
      className={clsx(
        'group relative flex gap-2 px-4 py-2',
        highlight && '!bg-primary-100 outline-primary-400 outline outline-2'
      )}
    >
      <Col className="w-full gap-1">
        <Row className="items-center justify-between">
          <Row className="items-center gap-2 text-sm">
            <Avatar
              username={post.creatorUsername}
              avatarUrl={post.creatorAvatarUrl}
              size={'2xs'}
            />
            <UserLink
              className="text-ink-400 text-sm"
              user={{
                id: post.creatorId,
                name: post.creatorName,
                username: post.creatorUsername,
              }}
            />
          </Row>
          <span className="text-ink-400 text-sm">
            Created {fromNow(post.createdTime)}
          </span>
        </Row>
        <div className="text-md text-ink-900 mb-1 font-medium">
          {post.title}
        </div>
        <Linkify
          className="text-ink-600 line-clamp-5 text-sm"
          text={richTextToString(post.content)}
        />
      </Col>
      {onPostClick ? (
        <a
          className="absolute bottom-0 left-0 right-0 top-0"
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
          className="absolute bottom-0 left-0 right-0 top-0"
        />
      )}
    </Card>
  )
}

export function PostCardList(props: {
  posts: Post[]
  highlightCards?: string[]
  onPostClick?: (post: Post) => void
  limit?: number
}) {
  const { posts, onPostClick, highlightCards, limit } = props

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
            highlight={highlightCards?.includes(post.id)}
          />
        </div>
      ))}
      {limit && limit != 0 && posts.length > limit && (
        <div className="flex justify-center">
          <button
            className="text-primary-700 text-sm font-semibold"
            onClick={() => setShownPosts(posts)}
          >
            Show all
          </button>
        </div>
      )}
    </div>
  )
}
