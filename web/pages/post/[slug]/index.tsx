import { Page } from 'web/components/layout/page'
import { Spacer } from 'web/components/layout/spacer'
import {
  Content,
  TextEditor,
  useTextEditor,
} from 'web/components/widgets/editor'
import {
  EyeOffIcon,
  PencilIcon,
  DotsHorizontalIcon,
} from '@heroicons/react/solid'
import { Button } from 'web/components/buttons/button'
import { useState, useEffect } from 'react'
import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'
import Custom404 from 'web/pages/404'
import { UserAvatarAndBadge } from 'web/components/widgets/user-link'
import { SEO } from 'web/components/SEO'
import { richTextToString } from 'common/util/parse'
import { CopyLinkOrShareButton } from 'web/components/buttons/copy-link-button'
import { DisplayUser, getUserById } from 'web/lib/supabase/users'
import { getPostShareUrl, TopLevelPost } from 'common/src/top-level-post'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'
import { getCommentsOnPost } from 'web/lib/supabase/comments'
import { PostComment } from 'common/comment'
import {
  PostCommentsActivity,
  useNewPostComments,
} from 'web/components/top-level-posts/post-comments'
import { ExpandingInput } from 'web/components/widgets/expanding-input'
import { useAdminOrMod } from 'web/hooks/use-admin'
import toast from 'react-hot-toast'
import { ReactButton } from 'web/components/contract/react-button'
import { getPostBySlug } from 'web/lib/supabase/posts'
import { useSaveReferral } from 'web/hooks/use-save-referral'
import DropdownMenu from 'web/components/widgets/dropdown-menu'
import { BackButton } from 'web/components/contract/back-button'

export async function getStaticProps(props: { params: { slug: string } }) {
  const { slug } = props.params

  const postData = await getPostBySlug(slug)
  const creator = postData ? await getUserById(postData.creatorId) : null
  const comments = postData ? await getCommentsOnPost(postData.id) : []
  const watched: string[] = []
  const skipped: string[] = []

  return {
    props: {
      post: postData,
      creator,
      comments,
      watched,
      skipped,
    },

    revalidate: 60, // regenerate after a minute
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function PostPage(props: {
  post: TopLevelPost | null
  creator: DisplayUser | null
  comments: PostComment[]
  watched?: string[] //user ids
  skipped?: string[] //user ids
}) {
  const { creator } = props
  const { comments: newComments } = useNewPostComments(props.post?.id ?? '_')
  const comments = [...newComments, ...props.comments]
  const [post, setPost] = useState(props.post)
  const isAdminOrMod = useAdminOrMod()
  const [editing, setEditing] = useState(false)
  const currentUser = useUser()
  useSaveReferral(currentUser, {
    defaultReferrerUsername: post?.creatorUsername,
  })

  useEffect(() => {
    setPost(props.post)
  }, [props.post])

  if (!post || !creator) {
    return <Custom404 />
  }
  const shareUrl = getPostShareUrl(post, currentUser?.username)

  const handleReact = () => {
    if (!currentUser || !post) return
    setPost((prevPost) => {
      if (!prevPost) return null
      const newLikedByUserIds = [
        ...(prevPost.likedByUserIds ?? []),
        currentUser.id,
      ]
      return {
        ...prevPost,
        likedByUserCount: (prevPost.likedByUserCount ?? 0) + 1,
        likedByUserIds: newLikedByUserIds,
      }
    })
  }

  const handleUnreact = () => {
    if (!currentUser || !post) return
    setPost((prevPost) => {
      if (!prevPost) return null
      const newLikedByUserIds =
        prevPost.likedByUserIds?.filter((id) => id !== currentUser.id) ?? []
      return {
        ...prevPost,
        likedByUserCount: Math.max(0, (prevPost.likedByUserCount ?? 0) - 1),
        likedByUserIds: newLikedByUserIds,
      }
    })
  }

  const togglePostVisibility = async () => {
    if (!post) return
    const newVisibility = post.visibility === 'unlisted' ? 'public' : 'unlisted'
    try {
      await api('update-post', {
        id: post.id,
        visibility: newVisibility,
      })
      setPost((prevPost) =>
        prevPost ? { ...prevPost, visibility: newVisibility } : null
      )
      toast.success(
        `Post successfully made ${
          newVisibility === 'public' ? 'public' : 'unlisted'
        }.`
      )
    } catch (error) {
      console.error('Error updating post visibility:', error)
      toast.error('Failed to update post visibility.')
    } finally {
    }
  }

  return (
    <Page trackPageView={'post slug page'}>
      <SEO
        title={post.title}
        description={richTextToString(post.content)}
        url={'/post/' + post.slug}
        shouldIgnore={post.visibility === 'unlisted'}
      />
      <Col className="mx-auto w-full max-w-2xl p-4">
        {!editing && (
          <Col>
            <Row>
              <BackButton className="!p-0" />
            </Row>
            <Row className="border-canvas-50 items-center justify-between gap-1 border-b py-4 text-3xl font-bold">
              <span>
                {post.title}{' '}
                {post.visibility === 'unlisted' && (
                  <EyeOffIcon className="inline-block h-4 w-4" />
                )}
              </span>
              {isAdminOrMod && post && (
                <DropdownMenu
                  items={[
                    {
                      name:
                        post.visibility === 'unlisted'
                          ? 'Make Public'
                          : 'Make Unlisted',
                      icon:
                        post.visibility === 'unlisted' ? (
                          <EyeOffIcon className="h-5 w-5" />
                        ) : (
                          <EyeOffIcon className="h-5 w-5" />
                        ),
                      onClick: togglePostVisibility,
                    },
                  ]}
                  buttonContent={<DotsHorizontalIcon className="h-5 w-5" />}
                  buttonClass="p-2"
                  menuWidth="w-40"
                />
              )}
            </Row>
            <Row className="border-canvas-50 items-center justify-between border-b py-4">
              <Row className="items-center gap-2">
                <UserAvatarAndBadge user={creator} />
                <CopyLinkOrShareButton
                  tooltip="Copy link to post"
                  url={shareUrl}
                  eventTrackingName={'copy post link'}
                />
                {post && (
                  <ReactButton
                    contentId={post.id}
                    contentCreatorId={post.creatorId}
                    user={currentUser}
                    contentType={'post'}
                    contentText={post.title}
                    trackingLocation={'post page'}
                    reactionType={'like'}
                    size={'sm'}
                    userReactedWith={
                      currentUser &&
                      post.likedByUserIds?.includes(currentUser.id)
                        ? 'like'
                        : 'none'
                    }
                    onReact={handleReact}
                    onUnreact={handleUnreact}
                  />
                )}
              </Row>
              <span className="text-ink-700">
                {new Date(post.createdTime).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </Row>
          </Col>
        )}
        <div className="bg-canvas-0 rounded-lg px-6 py-4 sm:py-0">
          <div className="flex w-full flex-col py-2">
            <RichEditPost
              post={post}
              onUpdate={setPost}
              editing={editing}
              setEditing={setEditing}
            />
          </div>
        </div>
        <Spacer h={4} />
        <div className="rounded-lg px-6 py-4 sm:py-0">
          <PostCommentsActivity post={post} comments={comments} />
        </div>
      </Col>
    </Page>
  )
}

function RichEditPost(props: {
  post: TopLevelPost
  children?: React.ReactNode
  onUpdate?: (post: TopLevelPost) => void
  editing: boolean
  setEditing: (isEditing: boolean) => void
}) {
  const { post, children, onUpdate, editing, setEditing } = props
  const user = useUser()
  const canEdit = user?.id === post.creatorId
  const [editableTitle, setEditableTitle] = useState(post.title)

  const editor = useTextEditor({
    defaultValue: post.content,
    key: `post ${post?.id || ''}`,
    size: 'lg',
  })

  return editing ? (
    <>
      <ExpandingInput
        value={editableTitle}
        onChange={(e) => setEditableTitle(e.target.value || '')}
        placeholder="Post title"
        className="mb-2 text-2xl font-bold"
      />
      <TextEditor editor={editor} />
      <Spacer h={2} />
      <Row className="gap-2">
        <Button
          color="gray"
          onClick={() => {
            setEditing(false)
            setEditableTitle(post.title)
            editor?.commands.focus('end')
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={async () => {
            if (!editor) return
            const { post: updatedPost } = await api('update-post', {
              id: post.id,
              title: editableTitle,
              content: editor.getJSON(),
            })
            onUpdate?.(updatedPost)
            setEditing(false)
          }}
        >
          Save
        </Button>
      </Row>
    </>
  ) : (
    <Col className="gap-2">
      <Content size="lg" content={post.content} />
      {canEdit && (
        <Row className="place-content-end">
          <Button
            color="gray-white"
            size="xs"
            onClick={() => {
              setEditableTitle(post.title)
              setEditing(true)
              editor?.commands.focus('end')
            }}
          >
            <PencilIcon className="inline h-4 w-4" />
          </Button>
          {children}
        </Row>
      )}
    </Col>
  )
}
