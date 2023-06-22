import { Group } from 'common/group'
import { Post } from 'common/post'
import { useState } from 'react'
import { useUser } from 'web/hooks/use-user'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { CreatePostForm } from '../posts/create-post'
import { PostCardList } from '../posts/post-card'
import { Subtitle } from '../widgets/subtitle'

export function GroupPostSection(props: { group: Group; posts: Post[] }) {
  const { group, posts } = props
  return (
    <Col className="pm:mx-10 gap-4 px-4 pb-12 pt-4 sm:pt-0">
      <GroupPosts group={group} posts={posts} />
    </Col>
  )
}

export function GroupPosts(props: { posts: Post[]; group: Group }) {
  const { posts, group } = props
  const [showCreatePost, setShowCreatePost] = useState(false)
  const user = useUser()

  return (
    <div className="align-start w-full items-start">
      {/* create post modal */}
      <Modal size="lg" open={showCreatePost} setOpen={setShowCreatePost}>
        <div className="bg-canvas-0 rounded-lg px-4 py-8">
          <CreatePostForm group={group} />
        </div>
      </Modal>
      {/* post list */}
      <Row className="flex justify-between">
        <Subtitle className="!my-0">Latest Posts</Subtitle>
        {user && (
          <Button onClick={() => setShowCreatePost(!showCreatePost)}>
            Add a Post
          </Button>
        )}
      </Row>

      <div className="mt-2">
        <PostCardList posts={posts} />
        {posts.length === 0 && (
          <div className="text-ink-500 text-center">No posts yet</div>
        )}
      </div>
    </div>
  )
}
