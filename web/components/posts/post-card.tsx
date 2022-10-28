import { DocumentIcon } from '@heroicons/react/solid'
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
import { useEffect, useMemo, useState } from 'react'
import { ChatIcon } from '@heroicons/react/outline'
import TipJar from 'web/public/custom-components/tipJar'
import { useItemTipTxns } from 'web/hooks/use-tip-txns'
import { sum } from 'lodash'

export function PostCard(props: {
  post: Post
  onPostClick?: (post: Post) => void
  highlightOptions?: CardHighlightOptions
}) {
  const tips = useItemTipTxns(props.post.id)
  const totalTipped = useMemo(() => {
    return sum(tips.map((tip) => tip.amount))
  }, [tips])

  const { post, onPostClick, highlightOptions } = props
  const { itemIds: itemIds, highlightClassName } = highlightOptions || {}

  return (
    <Card
      className={clsx(
        'group relative flex gap-3 py-4 px-6',
        itemIds?.includes(post.id) && highlightClassName
      )}
    >
      <Row className="flex grow justify-between">
        <Col className="gap-2">
          <Row className="items-center justify-between">
            <Row className="items-center gap-2 text-sm">
              <Avatar
                className="mx-1 h-7 w-7"
                username={post.creatorUsername}
                avatarUrl={post.creatorAvatarUrl}
                size={6}
              />
              <UserLink
                className="text-gray-400"
                name={post.creatorName}
                username={post.creatorUsername}
              />
              <span className="mx-1 text-gray-400">•</span>
              <span className="text-gray-400">{fromNow(post.createdTime)}</span>
              <div className="right-0 mx-2 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-indigo-300 px-2 py-0.5 text-xs font-medium text-white">
                <DocumentIcon className={'h3 w-3'} />
                Post
              </div>
            </Row>
          </Row>
          <div className="break-words text-lg font-semibold text-indigo-700 group-hover:underline group-hover:decoration-indigo-400 group-hover:decoration-2">
            {post.title}
          </div>
          <div className="font-small text-md break-words text-gray-500">
            {post.subtitle}
          </div>
          <Row className="space-x-2 pt-1">
            <Row className="space-x-1">
              <ChatIcon className="h-5 w-5 text-gray-400" />
              <div className="text-sm text-gray-400">
                {post.commentCount ?? 0}
              </div>
            </Row>
            <Row className="space-x-1">
              <TipJar size={18} />
              <div className="text-sm text-gray-400">{totalTipped / 10}</div>
            </Row>
          </Row>
        </Col>
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
      {limit && posts.length > limit && (
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
