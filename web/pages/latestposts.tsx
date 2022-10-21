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
import { useUser } from 'web/hooks/use-user'
import { SiteLink } from 'web/components/widgets/site-link'
import { track } from '@amplitude/analytics-browser'
import { Button } from 'web/components/buttons/button'

export default function LatestPostsPage() {
  useTracking('view latest posts page')
  const posts = useAllPosts(true)
  const user = useUser()

  return (
    <Page>
      <Col className="pm:mx-10 gap-4 sm:px-4 sm:pb-4">
        <Row className="mt-4 items-start justify-between sm:mt-0">
          <Col>
            <Title className="mx-4 !mb-0 !mt-0 sm:mx-0" text="Latest Posts" />
          </Col>
          <Col>
            {user && (
              <SiteLink
                className="mb-3 text-xl"
                href={'/create-post'}
                onClick={() =>
                  track('latest posts click create post', {
                    section: 'create-post',
                  })
                }
              >
                <Button className="mx-2">Create Post</Button>
              </SiteLink>
            )}
          </Col>
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
