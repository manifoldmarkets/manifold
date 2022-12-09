import { Page } from 'web/components/layout/page'

import { postPath, getPostBySlug, updatePost } from 'web/lib/firebase/posts'
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
import { listAllCommentsOnPost } from 'web/lib/firebase/comments'
import { PostComment } from 'common/comment'
import { CommentTipMap, useTipTxns } from 'web/hooks/use-tip-txns'
import { groupBy, sortBy } from 'lodash'
import {
  PostCommentInput,
  PostCommentThread,
} from 'web/components/posts/post-comments'
import { useCommentsOnPost } from 'web/hooks/use-comments'
import { useUser } from 'web/hooks/use-user'
import { usePost } from 'web/hooks/use-post'
import { SEO } from 'web/components/SEO'
import { Subtitle } from 'web/components/widgets/subtitle'
import { SimpleLinkButton } from 'web/components/buttons/simple-link-button'

export async function getStaticProps(props: { params: { slugs: string[] } }) {
  const { slugs } = props.params

  const post = await getPostBySlug(slugs[0])
  const creator = post ? await getUser(post.creatorId) : null
  const comments = post && (await listAllCommentsOnPost(post.id))

  return {
    props: {
      post,
      creator,
      comments,
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
}) {
  const { creator } = props
  const postId = props.post?.id ?? '_'
  const post = usePost(postId) ?? props.post

  const tips = useTipTxns({ postId })
  const updatedComments = useCommentsOnPost(postId)
  const comments = updatedComments ?? props.comments
  const user = useUser()

  if (!post) {
    return <Custom404 />
  }
  const shareUrl = `https://${ENV_CONFIG.domain}${postPath(post.slug)}`

  return (
    <Page>
      <SEO
        title={post.title}
        description={post.subtitle}
        url={'/post/' + post.slug}
      />
      <div className="mx-auto w-full max-w-3xl ">
        <div>
          <Title className="!my-0 px-2 pt-4" text={post.title} />
          <br />
          <Subtitle className="!mt-2 px-2 pb-4" text={post.subtitle} />
        </div>
        <Row className="items-center">
          <Col className="flex-1 px-2">
            <div className={'inline-flex'}>
              <div className="mr-1 text-gray-500">Created by</div>
              <UserLink
                className="text-gray-700"
                name={creator.name}
                username={creator.username}
              />
            </div>
          </Col>
          <Row className="items-center gap-2 sm:pr-2">
            <SimpleLinkButton
              getUrl={() => shareUrl}
              tooltip={'Copy link to post'}
            />
          </Row>
        </Row>

        <Spacer h={2} />
        <div className="rounded-lg bg-white px-6 py-4 sm:py-0">
          <div className="flex w-full flex-col py-2">
            <RichEditPost
              post={post}
              canEdit={!!user && user.id === post.creatorId}
            />
          </div>
        </div>

        <Spacer h={4} />
        <div className="rounded-lg bg-white px-6 py-4 sm:py-0">
          <PostCommentsActivity post={post} comments={comments} tips={tips} />
        </div>
      </div>
    </Page>
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

  const editor = useTextEditor({
    defaultValue: post.content,
    key: `post ${post?.id || ''}`,
    size: 'lg',
  })

  async function savePost() {
    if (!editor) return

    await updatePost(post, {
      content: editor.getJSON(),
    })
  }

  return editing ? (
    <>
      <TextEditor editor={editor} />
      <Spacer h={2} />
      <Row className="gap-2">
        <Button
          onClick={async () => {
            await savePost()
            setEditing(false)
          }}
        >
          Save
        </Button>
        <Button color="gray" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </Row>
    </>
  ) : (
    <Col>
      <Content size="lg" content={post.content} />
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
