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
import { FeaturedPill } from '../contract/contract-card'
import { richTextToString } from 'common/util/parse'
import { Linkify } from '../widgets/linkify'

export function PostCard(props: {
  post: Post
  onPostClick?: (post: Post) => void
  highlight?: boolean
  pinned?: boolean
}) {
  const { post, onPostClick, highlight, pinned } = props

  return (
    <Card
      className={clsx(
        'group relative flex gap-2 py-2 px-4',
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
              name={post.creatorName}
              username={post.creatorUsername}
            />
          </Row>
          <span className="text-ink-400 text-sm">
            Created {fromNow(post.createdTime)}
          </span>
          {pinned && <FeaturedPill label={post.featuredLabel} />}
        </Row>
        <div className="text-md text-ink-900 mb-1 font-medium">
          {post.title}
        </div>
        <Linkify
          className="line-clamp-5 text-ink-600 text-sm"
          text={richTextToString(post.content)}
        />
        <Row className="gap-2 pt-1">
          <Row className="text-ink-400 gap-1 text-sm">
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
