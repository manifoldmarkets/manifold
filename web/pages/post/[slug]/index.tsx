import { Page } from 'web/components/layout/page'
import { getPostBySlug, postPath } from 'web/lib/supabase/post'
import { updatePost } from 'web/lib/supabase/post'
import { Post } from 'common/post'
import { Title } from 'web/components/widgets/title'
import { Spacer } from 'web/components/layout/spacer'
import {
  Content,
  TextEditor,
  useTextEditor,
} from 'web/components/widgets/editor'
import { getUser, User } from 'web/lib/firebase/users'
import { PencilIcon } from '@heroicons/react/solid'
import { Button } from 'web/components/buttons/button'
import React, { useState } from 'react'
import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'
import { ENV_CONFIG } from 'common/envs/constants'
import Custom404 from 'web/pages/404'
import { UserLink } from 'web/components/widgets/user-link'
import { PostComment } from 'common/comment'
import { CommentTipMap, useTipTxns } from 'web/hooks/use-tip-txns'
import { groupBy, sortBy } from 'lodash'
import {
  PostCommentInput,
  PostCommentThread,
} from 'web/components/posts/post-comments'
import { useNewCommentsOnPost } from 'web/hooks/use-comments'
import { useUser } from 'web/hooks/use-user'
import { SEO } from 'web/components/SEO'
import { EditInPlaceInput } from 'web/components/widgets/edit-in-place'
import { richTextToString } from 'common/util/parse'
import { CopyLinkButton } from 'web/components/buttons/copy-link-button'
import { getUsersWhoSkipped, getUsersWhoWatched } from 'web/lib/supabase/ads'
import { formatMoney } from 'common/util/format'
import { Ad } from 'common/ad'
import { TimerClaimBox } from 'web/pages/ad'
import { useRouter } from 'next/router'
import { getCommentsOnPost } from 'web/lib/supabase/comments'

export async function getStaticProps(props: { params: { slug: string } }) {
  const { slug } = props.params

  const post = await getPostBySlug(slug)
  const creator = post ? await getUser(post.creatorId) : null
  const comments = post && (await getCommentsOnPost(post.id))

  let watched: string[] = []
  let skipped: string[] = []
  if (post?.type === 'ad') {
    ;[watched, skipped] = await Promise.all([
      getUsersWhoWatched(post.id),
      getUsersWhoSkipped(post.id),
    ])
  }

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
  post: Post | null
  creator: User
  comments: PostComment[]
  watched?: string[] //user ids
  skipped?: string[] //user ids
}) {
  const { creator, watched = [], skipped = [], post } = props
  const postId = post?.id ?? '_'

  console.log(props.comments)

  const tips = useTipTxns({ postId })
  const updatedComments = useNewCommentsOnPost(postId)
  const comments = [...props.comments, ...updatedComments]
  const user = useUser()

  if (!post) {
    return <Custom404 />
  }
  const shareUrl = `https://${ENV_CONFIG.domain}${postPath(post.slug)}`

  const canEdit = !!user && user.id === post.creatorId

  return (
    <Page>
      <SEO
        title={post.title}
        description={richTextToString(post.content)}
        url={'/post/' + post.slug}
      />
      <div className="mx-auto mt-1 flex w-full max-w-2xl flex-col">
        <EditInPlaceInput
          className="-m-px px-2 !text-3xl"
          initialValue={post.title}
          onSave={(title) => updatePost(post, { title })}
          disabled={!canEdit}
        >
          {(value) => <Title className="!my-0 p-2" children={value} />}
        </EditInPlaceInput>
        <div className="h-2" />
        <Row className="mt-4 items-center">
          <div className="flex px-2">
            <div className="text-ink-500 mr-1">Created by</div>
            <UserLink
              className="text-ink-700"
              name={creator.name}
              username={creator.username}
            />
          </div>
          <Row className="items-center sm:pr-2">
            <CopyLinkButton
              linkIconOnlyProps={{
                tooltip: 'Copy link to post',
              }}
              url={shareUrl}
              eventTrackingName={'copy post link'}
            />
          </Row>
        </Row>

        <Spacer h={2} />
        <div className="bg-canvas-0 rounded-lg px-6 py-4 sm:py-0">
          <div className="flex w-full flex-col py-2">
            <RichEditPost post={post} canEdit={canEdit} />
          </div>
        </div>

        {post.type === 'ad' && (
          <AdSection
            ad={post as Ad}
            watchedCount={watched.length}
            skippedCount={skipped.length}
            userCanClaim={
              !!user &&
              post.creatorId !== user.id &&
              !watched.includes(user.id ?? '')
            }
          />
        )}

        <Spacer h={4} />
        <div className="rounded-lg px-6 py-4 sm:py-0">
          <PostCommentsActivity post={post} comments={comments} tips={tips} />
        </div>
      </div>
    </Page>
  )
}

function AdSection(props: {
  ad: Ad
  skippedCount: number
  watchedCount: number
  userCanClaim: boolean
}) {
  const { ad, skippedCount, watchedCount, userCanClaim } = props
  const router = useRouter()

  return (
    <>
      {userCanClaim && ad.funds > ad.costPerView && (
        <>
          <div className="mt-4 w-full text-center">
            This post is promoted! Reward for reading:
          </div>
          <TimerClaimBox
            ad={ad}
            onNext={() => router.push('/ad')}
            className="mt-2"
          />
        </>
      )}
      <div className="bg-canvas-0 mt-4 flex justify-between gap-4 rounded-md p-4">
        <span>Ad Analytics</span>
        <span>
          {watchedCount} watches, {skippedCount} skips
        </span>
        <span>
          {formatMoney(ad.funds)} left at {formatMoney(ad.costPerView)} per view
        </span>
      </div>
    </>
  )
}

export function PostCommentsActivity(props: {
  post: Post
  comments: PostComment[]
  tips: CommentTipMap
}) {
  const { post, comments, tips } = props
  const commentsByUserId = groupBy(comments, (c) => c.userId)
  const commentsByParentId = groupBy(comments, (c) => c.replyToCommentId ?? '_')
  const topLevelComments = sortBy(
    commentsByParentId['_'] ?? [],
    (c) => -c.createdTime
  )

  return (
    <Col className="p-2">
      <PostCommentInput post={post} />
      {topLevelComments.map((parent) => (
        <PostCommentThread
          key={parent.id}
          post={post}
          parentComment={parent}
          threadComments={sortBy(
            commentsByParentId[parent.id] ?? [],
            (c) => c.createdTime
          )}
          tips={tips}
          commentsByUserId={commentsByUserId}
        />
      ))}
    </Col>
  )
}

export function RichEditPost(props: {
  post: Post
  canEdit: boolean
  children?: React.ReactNode
}) {
  const { post, canEdit, children } = props
  const [editing, setEditing] = useState(false)
  const [contentCache, setContentCache] = useState(post.content)

  const editor = useTextEditor({
    defaultValue: post.content,
    key: `post ${post?.id || ''}`,
    size: 'lg',
  })

  async function savePost() {
    if (!editor) return

    setContentCache(editor.getJSON())
    await updatePost(post, { content: editor.getJSON() })
    setEditing(false)
  }

  return editing ? (
    <>
      <TextEditor editor={editor} />
      <Spacer h={2} />
      <Row className="gap-2">
        <Button onClick={savePost}>Save</Button>
        <Button color="gray" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </Row>
    </>
  ) : (
    <Col>
      <Content size="lg" content={contentCache} />
      {canEdit && (
        <Row className="place-content-end">
          <Button
            color="gray-white"
            size="xs"
            onClick={() => {
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
