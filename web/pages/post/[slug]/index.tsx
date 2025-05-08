import { Page } from 'web/components/layout/page'
import { Spacer } from 'web/components/layout/spacer'
import {
  Content,
  TextEditor,
  useTextEditor,
} from 'web/components/widgets/editor'
import { EyeOffIcon, PencilIcon } from '@heroicons/react/solid'
import { Button } from 'web/components/buttons/button'
import { useState } from 'react'
import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'
import { ENV_CONFIG } from 'common/envs/constants'
import Custom404 from 'web/pages/404'
import { UserAvatarAndBadge } from 'web/components/widgets/user-link'
import { SEO } from 'web/components/SEO'
import { richTextToString } from 'common/util/parse'
import { CopyLinkOrShareButton } from 'web/components/buttons/copy-link-button'
import { run } from 'common/supabase/utils'
import { DisplayUser, getUserById } from 'web/lib/supabase/users'
import { db } from 'web/lib/supabase/db'
import { convertPost, TopLevelPost } from 'common/src/top-level-post'
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

export async function getStaticProps(props: { params: { slug: string } }) {
  const { slug } = props.params

  const post = await getPostBySlug(slug)
  const creator = post ? await getUserById(post.creatorId) : null
  const comments = post ? await getCommentsOnPost(post.id) : []
  const watched: string[] = []
  const skipped: string[] = []

  return {
    props: {
      post,
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
  const [isVisibilityLoading, setIsVisibilityLoading] = useState(false)
  const [editing, setEditing] = useState(false)

  if (!post || !creator) {
    return <Custom404 />
  }
  const shareUrl = `https://${ENV_CONFIG.domain}${postPath(post.slug)}`

  const togglePostVisibility = async () => {
    if (!post) return
    setIsVisibilityLoading(true)
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
      setIsVisibilityLoading(false)
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
            <div className="border-canvas-50 border-b py-4 text-3xl font-bold">
              {post.visibility === 'unlisted' && (
                <EyeOffIcon className="h-4 w-4" />
              )}
              {post.title}
            </div>
            <Row className="border-canvas-50 items-center justify-between border-b py-4">
              <Row className="gap-2">
                <UserAvatarAndBadge user={creator} />
                <CopyLinkOrShareButton
                  tooltip="Copy link to post"
                  url={shareUrl}
                  eventTrackingName={'copy post link'}
                />
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
        <Row>
          {isAdminOrMod && post && (
            <Button
              size="xs"
              color={'gray-outline'}
              onClick={togglePostVisibility}
              loading={isVisibilityLoading}
            >
              {post.visibility === 'unlisted' ? 'Make Public' : 'Make Unlisted'}
            </Button>
          )}
        </Row>
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

function postPath(postSlug: string) {
  return `/post/${postSlug}`
}

async function getPostBySlug(slug: string) {
  const { data } = await run(
    db.from('old_posts').select().eq('data->>slug', slug)
  )
  if (data && data.length > 0) {
    return convertPost(data[0])
  }
  return null
}

export async function getPost(postId: string) {
  const { data } = await run(db.from('old_posts').select().eq('id', postId))
  if (data && data.length > 0) {
    return convertPost(data[0])
  }
  return null
}

export async function getAllPosts() {
  const { data } = await run(
    db
      .from('old_posts')
      .select()
      .eq('visibility', 'public')
      .order('created_time', { ascending: false } as any)
  )
  return data.map(convertPost)
}

export async function getPostsByUser(userId: string) {
  const { data } = await run(
    db
      .from('old_posts')
      .select()
      .eq('creator_id', userId)
      .order('created_time', { ascending: false } as any)
  )
  return data.map(convertPost)
}
