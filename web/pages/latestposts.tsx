import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { useTracking } from 'web/hooks/use-tracking'
import { useAllPosts } from 'web/hooks/use-post'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import Masonry from 'react-masonry-css'
import { Post } from 'common/post'
import { PostCard } from 'web/components/posts/post-card'

export default function LatestPostsPage() {
  useTracking('view latest posts page')
  const posts = useAllPosts()

  return (
    <Page>
      <Col className="pm:mx-10 gap-4 sm:px-4 sm:pb-4">
        <Row className="mt-4 items-start justify-between sm:mt-0">
          <Title className="mx-4 !mb-0 !mt-0 sm:mx-0" text="Latest Posts" />
        </Row>
        {posts ? <LatestPosts latestPosts={posts} /> : <LoadingIndicator />}
      </Col>
    </Page>
  )
}

export function LatestPosts(props: { latestPosts: Post[] }) {
  const { latestPosts } = props
  return (
    <Masonry
      // Show only 1 column on tailwind's md breakpoint (768px)
      breakpointCols={{ default: 2, 768: 1 }}
      className="-ml-4 flex w-auto"
      columnClassName="pl-4 bg-clip-padding"
    >
      {latestPosts.map((post) => (
        <div className="mb-1" key={post.id}>
          <PostCard key={post.id} post={post} />
        </div>
      ))}
    </Masonry>
  )
}
