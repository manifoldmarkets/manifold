import { Page } from 'web/components/page'

import { postPath, getPostBySlug } from 'web/lib/firebase/posts'
import { Post } from 'common/post'
import { Title } from 'web/components/title'
import { Spacer } from 'web/components/layout/spacer'
import { Content } from 'web/components/editor'
import { getUser, User } from 'web/lib/firebase/users'
import { ShareIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Button } from 'web/components/button'
import { useState } from 'react'
import { SharePostModal } from 'web/components/share-post-modal'
import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'
import { ENV_CONFIG } from 'common/envs/constants'
import Custom404 from 'web/pages/404'
import { UserLink } from 'web/components/user-link'
import { listAllCommentsOnPost } from 'web/lib/firebase/comments'
import { PostComment } from 'common/comment'
import { CommentTipMap, useTipTxns } from 'web/hooks/use-tip-txns'
import { groupBy, sortBy } from 'lodash'
import { PostCommentThread, CommentInput } from 'web/posts/post-comments'
import { useCommentsOnPost } from 'web/hooks/use-comments'

export async function getStaticProps(props: { params: { slugs: string[] } }) {
  const { slugs } = props.params

  const post = await getPostBySlug(slugs[0])
  const creator = post ? await getUser(post.creatorId) : null
  const comments = post && (await listAllCommentsOnPost(post.id))

  return {
    props: {
      post: post,
      creator: creator,
      comments: comments,
    },

    revalidate: 60, // regenerate after a minute
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function PostPage(props: {
  post: Post
  creator: User
  comments: PostComment[]
}) {
  const [isShareOpen, setShareOpen] = useState(false)

  const tips = useTipTxns({ postId: props.post.id })
  const shareUrl = `https://${ENV_CONFIG.domain}${postPath(props?.post.slug)}`
  const updatedComments = useCommentsOnPost(props.post.id)
  const comments = updatedComments ?? props.comments

  if (props.post == null) {
    return <Custom404 />
  }

  return (
    <Page>
      <div className="mx-auto w-full max-w-3xl ">
        <Spacer h={1} />
        <Title className="!mt-0" text={props.post.title} />
        <Row>
          <Col className="flex-1">
            <div className={'inline-flex'}>
              <div className="mr-1 text-gray-500">Created by</div>
              <UserLink
                className="text-neutral"
                name={props.creator.name}
                username={props.creator.username}
              />
            </div>
          </Col>
          <Col>
            <Button
              size="lg"
              color="gray-white"
              className={'flex'}
              onClick={() => {
                setShareOpen(true)
              }}
            >
              <ShareIcon
                className={clsx('mr-2 h-[24px] w-5')}
                aria-hidden="true"
              />
              Share
              <SharePostModal
                isOpen={isShareOpen}
                setOpen={setShareOpen}
                shareUrl={shareUrl}
              />
            </Button>
          </Col>
        </Row>

        <Spacer h={2} />
        <div className="rounded-lg bg-white px-6 py-4 sm:py-0">
          <div className="form-control w-full py-2">
            <Content content={props.post.content} />
          </div>
        </div>

        <Spacer h={2} />
        <div className="rounded-lg bg-white px-6 py-4 sm:py-0">
          <PostCommentsActivity
            post={props.post}
            comments={comments}
            tips={tips}
            user={props.creator}
          />
        </div>
      </div>
    </Page>
  )
}

export function PostCommentsActivity(props: {
  post: Post
  comments: PostComment[]
  tips: CommentTipMap
  user: User | null | undefined
}) {
  const { post, comments, user, tips } = props
  const commentsByUserId = groupBy(comments, (c) => c.userId)
  const commentsByParentId = groupBy(comments, (c) => c.replyToCommentId ?? '_')
  const topLevelComments = sortBy(
    commentsByParentId['_'] ?? [],
    (c) => -c.createdTime
  )

  return (
    <>
      <CommentInput
        className="mb-5"
        post={post}
        commentsByCurrentUser={(user && commentsByUserId[user.id]) ?? []}
      />
      {topLevelComments.map((parent) => (
        <PostCommentThread
          key={parent.id}
          user={user}
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
    </>
  )
}
