import { ChatIcon } from '@heroicons/react/outline'
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
import { Linkify } from '../widgets/linkify'
import { UserLink } from '../widgets/user-link'

export function PostCard(props: { post: TopLevelPost }) {
  const { post } = props
  const isAdminOrMod = useAdminOrMod()
  const currentUser = useUser()
  const [commentCount, setCommentCount] = useState<number | null>(null)

  useEffect(() => {
    getNumPostComments(post.id).then(setCommentCount)
  }, [post.id])

  const handleSetUnlisted = async () => {
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
    }
  }

  const handleSuperban = async () => {
    toast.promise(superBanUser(post.creatorId), {
      loading: 'Superbanning user...',
      success: (message) => message,
      error: (error) => error.message,
    })
  }

  // Create dropdown menu items for admin/mod users
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
          <Row className="items-center gap-2">
            <span className="text-ink-400 text-sm">
              Active {fromNow(post.lastCommentTime ?? post.createdTime)}
            </span>
            {isAdminOrMod && dropdownItems.length > 0 && (
              <DropdownMenu
                items={dropdownItems}
                buttonContent={<DotsHorizontalIcon className="h-5 w-5" />}
                menuWidth="w-40"
                buttonClass="px-1 py-0 hover:bg-ink-100 rounded"
                className="z-10"
              />
            )}
          </Row>
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

      <Row className="items-center gap-4 self-end">
        {commentCount !== null && (
          <Row className="text-ink-600 items-center gap-1">
            <ChatIcon className="h-6 w-6" />
            <span className="text-ink-600 text-sm">{commentCount}</span>
          </Row>
        )}
        <div
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          className="z-10a"
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
            className={'z-10'}
            userReactedWith={
              currentUser && post.likedByUserIds?.includes(currentUser.id)
                ? 'like'
                : 'none'
            }
          />
        </div>
      </Row>

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
    </Col>
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
    <div className="w-full">
      {shownPosts.map((post) => (
        <div className="mb-1" key={post.id}>
          <PostCard key={post.id} post={post} />
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
