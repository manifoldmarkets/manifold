import { ChatIcon, ClockIcon, FireIcon } from '@heroicons/react/outline'
import { DotsHorizontalIcon, EyeOffIcon } from '@heroicons/react/solid'
import { fromNow } from 'client-common/lib/time'
import clsx from 'clsx'
import { TopLevelPost } from 'common/top-level-post'
import { buildArray } from 'common/util/array'
import { richTextToString } from 'common/util/parse'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { IoWarning } from 'react-icons/io5'
import { useAdminOrMod } from 'web/hooks/use-admin'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { track } from 'web/lib/service/analytics'
import { getNumPostComments } from 'web/lib/supabase/comments'
import { superBanUser } from 'web/lib/supabase/super-ban-user'
import { ReactButton } from '../contract/react-button'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Avatar } from '../widgets/avatar'
import DropdownMenu from '../widgets/dropdown-menu'
import { UserLink } from '../widgets/user-link'

export function PostCard(props: {
  post: TopLevelPost
  featured?: boolean
  className?: string
}) {
  const { post, featured, className } = props
  const isAdminOrMod = useAdminOrMod()
  const currentUser = useUser()
  const [commentCount, setCommentCount] = useState<number | null>(null)

  useEffect(() => {
    getNumPostComments(post.id).then(setCommentCount)
  }, [post.id])

  const handleSetUnlisted = async () => {
    try {
      await api('update-post', {
        id: post.id,
        visibility: post.visibility === 'unlisted' ? 'public' : 'unlisted',
      })
      toast.success('Post marked as unlisted')
    } catch (error) {
      console.error('Error updating post visibility:', error)
      const errorMessage = (error as any)?.message || 'Failed to update post'
      toast.error(errorMessage)
    }
  }

  const handleSuperban = async () => {
    toast.promise(superBanUser(post.creatorId), {
      loading: 'Superbanning user...',
      success: (message) => message,
      error: (error) => error.message,
    })
  }

  const dropdownItems = buildArray(
    isAdminOrMod && {
      name: post.visibility === 'unlisted' ? 'List' : 'Unlist',
      icon: <EyeOffIcon className="h-5 w-5" />,
      onClick: handleSetUnlisted,
    },
    isAdminOrMod && {
      name: 'Superban',
      icon: <IoWarning className="h-5 w-5" />,
      onClick: handleSuperban,
    }
  )

  const contentPreview = richTextToString(post.content)
  const isLongContent = contentPreview.length > 200

  return (
    <article
      className={clsx(
        'group relative',
        'bg-canvas-0 rounded-xl',
        'border border-ink-200 dark:border-ink-300',
        'transition-all duration-200 ease-out',
        'hover:border-primary-300 dark:hover:border-primary-500',
        'hover:shadow-lg hover:shadow-primary-500/5',
        featured && 'ring-2 ring-primary-500/20',
        className
      )}
    >
      {/* Featured badge */}
      {featured && (
        <div className="absolute -top-2.5 left-4">
          <span className="bg-primary-500 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium text-white shadow-sm">
            <FireIcon className="h-3 w-3" />
            Featured
          </span>
        </div>
      )}

      <div className={clsx('p-5', featured && 'pt-6')}>
        {/* Header */}
        <Row className="items-start justify-between gap-3">
          <Row className="min-w-0 flex-1 items-center gap-3">
            <Avatar
              username={post.creatorUsername}
              avatarUrl={post.creatorAvatarUrl}
              size="sm"
              className="ring-2 ring-canvas-0 dark:ring-ink-100"
            />
            <Col className="min-w-0 flex-1 gap-0.5">
              <UserLink
                className="text-ink-900 text-sm font-medium hover:underline"
                user={{
                  id: post.creatorId,
                  name: post.creatorName,
                  username: post.creatorUsername,
                }}
              />
              <Row className="text-ink-500 items-center gap-1.5 text-xs">
                <ClockIcon className="h-3.5 w-3.5" />
                <span>
                  {post.lastCommentTime
                    ? `Active ${fromNow(post.lastCommentTime)}`
                    : fromNow(post.createdTime)}
                </span>
              </Row>
            </Col>
          </Row>

          {/* Admin dropdown */}
          {isAdminOrMod && dropdownItems.length > 0 && (
            <div className="relative z-10">
              <DropdownMenu
                items={dropdownItems}
                buttonContent={
                  <DotsHorizontalIcon className="text-ink-400 hover:text-ink-600 h-5 w-5 transition-colors" />
                }
                menuWidth="w-40"
                buttonClass="p-1 hover:bg-ink-100 rounded-lg transition-colors"
              />
            </div>
          )}
        </Row>

        {/* Title */}
        <div className="mt-4">
          <Row className="items-start gap-2">
            {post.visibility === 'unlisted' && (
              <EyeOffIcon className="text-ink-400 mt-0.5 h-4 w-4 flex-shrink-0" />
            )}
            <h3 className="text-ink-900 text-lg font-semibold leading-snug tracking-tight transition-colors group-hover:text-primary-600">
              {post.title}
            </h3>
          </Row>
        </div>

        {/* Content preview */}
        <p
          className={clsx(
            'text-ink-600 mt-2 text-sm leading-relaxed',
            isLongContent ? 'line-clamp-3' : 'line-clamp-5'
          )}
        >
          {contentPreview}
        </p>

        {/* Footer */}
        <Row className="mt-4 items-center justify-between border-t border-ink-100 pt-4 dark:border-ink-200">
          <Row className="items-center gap-4">
            {/* Comment count */}
            {commentCount !== null && (
              <Row className="text-ink-500 items-center gap-1.5 text-sm">
                <ChatIcon className="h-6 w-6" />
                <span className="tabular-nums">{commentCount}</span>
              </Row>
            )}
          </Row>

          {/* Like button */}
          <div
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
            className="relative z-10"
          >
            <ReactButton
              contentId={post.id}
              contentCreatorId={post.creatorId}
              user={currentUser}
              contentType={'post'}
              contentText={post.title}
              trackingLocation={'post card'}
              reactionType={'like'}
              size={'xs'}
              color="gray-white"
              className="group"
              heartClassName="stroke-ink-700 dark:stroke-ink-400 group-hover:stroke-ink-900 dark:group-hover:stroke-ink-300"
              userReactedWith={
                currentUser && post.likedByUserIds?.includes(currentUser.id)
                  ? 'like'
                  : 'none'
              }
            />
          </div>
        </Row>
      </div>

      {/* Full card link overlay */}
      <Link
        href={`/post/${post.slug}`}
        onClick={() => {
          track('select post card', {
            slug: post.slug,
            postId: post.id,
          })
        }}
        className="absolute inset-0 rounded-xl"
      />
    </article>
  )
}

export function PostCardList(props: {
  posts: TopLevelPost[]
  highlightCards?: string[]
  limit?: number
}) {
  const { posts, limit } = props

  const [shownPosts, setShownPosts] = useState<TopLevelPost[]>(posts)
  useEffect(() => {
    if (limit && limit != 0) {
      setShownPosts(posts.slice(0, limit))
    } else {
      setShownPosts(posts)
    }
  }, [posts, limit])

  return (
    <div className="w-full space-y-3">
      {shownPosts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
      {limit && limit != 0 && posts.length > limit && (
        <div className="flex justify-center pt-2">
          <button
            className="text-primary-600 hover:text-primary-700 text-sm font-medium transition-colors"
            onClick={() => setShownPosts(posts)}
          >
            Show all {posts.length} posts
          </button>
        </div>
      )}
    </div>
  )
}
