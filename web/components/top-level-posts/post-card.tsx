import clsx from 'clsx'
import { TopLevelPost } from 'common/top-level-post'
import Link from 'next/link'
import { Avatar } from '../widgets/avatar'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { UserLink } from '../widgets/user-link'
import { track } from 'web/lib/service/analytics'
import { useEffect, useState } from 'react'
import { richTextToString } from 'common/util/parse'
import { Linkify } from '../widgets/linkify'
import { fromNow } from 'client-common/lib/time'
import { api } from 'web/lib/api/api'
import { Button } from '../buttons/button'
import toast from 'react-hot-toast'
import { EyeOffIcon } from '@heroicons/react/solid'
import { useAdminOrMod } from 'web/hooks/use-admin'
export function PostCard(props: {
  post: TopLevelPost
  onPostClick?: (post: TopLevelPost) => void
}) {
  const { post, onPostClick } = props
  const [isLoading, setIsLoading] = useState(false)
  const isAdminOrMod = useAdminOrMod()

  const handleSetUnlisted = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      // We need to pass title and content, otherwise they might be wiped by the update.
      // The backend API merges the provided fields with the existing post data.
      // Ensure `post.content` is in the format expected by the API (likely JSONContent).
      await api('update-post', {
        id: post.id,
        visibility: post.visibility === 'unlisted' ? 'public' : 'unlisted',
      })
      toast.success('Post marked as unlisted')
      // Optionally, trigger a refresh or update local state if needed
      // For now, the parent component would need to re-fetch or update the post list
      // to see the change reflected visually beyond a toast.
    } catch (error) {
      console.error('Error updating post visibility:', error)
      const errorMessage = (error as any)?.message || 'Failed to update post'
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Col
      className={clsx(
        'bg-canvas-50 group relative mx-1 flex gap-2 rounded px-4 py-2'
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
          {post.visibility === 'unlisted' && <EyeOffIcon className="h-4 w-4" />}
          {post.title}
        </div>
        <Linkify
          className="text-ink-600 line-clamp-5 text-sm"
          text={richTextToString(post.content)}
        />
      </Col>
      {/* Action button to make post unlisted */}
      {/* This button will appear for all users, API will enforce permissions */}
      <Row className="items-center gap-2 self-end">
        {isAdminOrMod && (
          <Button
            size="xs"
            color="gray-outline"
            className="z-10"
            onClick={handleSetUnlisted}
            loading={isLoading}
            disabled={isLoading}
          >
            Make Unlisted
          </Button>
        )}
      </Row>
      {onPostClick ? (
        <a
          className="absolute bottom-0 left-0 right-0 top-0"
          onClick={(e) => {
            // Let the browser handle the link click (opens in new tab).
            if (e.ctrlKey || e.metaKey) return

            e.preventDefault()
            track('select post card', {
              slug: post.slug,
              postId: post.id,
            })
            onPostClick(post)
          }}
        />
      ) : (
        <Link
          href={`/post/${post.slug}`}
          onClick={() => {
            track('select post card', {
              slug: post.slug,
              postId: post.id,
            })
          }}
          className="absolute bottom-0 left-0 right-0 top-0"
        />
      )}
    </Col>
  )
}

export function PostCardList(props: {
  posts: TopLevelPost[]
  highlightCards?: string[]
  onPostClick?: (post: TopLevelPost) => void
  limit?: number
}) {
  const { posts, onPostClick, highlightCards, limit } = props

  const [shownPosts, setShownPosts] = useState<TopLevelPost[]>(posts)
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
          <PostCard key={post.id} post={post} onPostClick={onPostClick} />
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
