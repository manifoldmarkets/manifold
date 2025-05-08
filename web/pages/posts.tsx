import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { TopLevelPost } from 'common/top-level-post'
import { PostCard } from 'web/components/top-level-posts/post-card'
import { useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { buttonClass } from 'web/components/buttons/button'
import Link from 'next/link'
import { getAllPosts } from './post/[slug]'
export async function getStaticProps() {
  const posts = await getAllPosts()
  return {
    props: {
      posts,
    },
  }
}

export default function LatestPostsPage(props: { posts: TopLevelPost[] }) {
  const { posts } = props
  const user = useUser()

  return (
    <Page trackPageView={'latest posts page'}>
      <Col className="py-2">
        <Row className="my-4 items-start justify-between sm:mt-0">
          <Col>
            <Title className="mx-4 !mb-0 sm:mx-0">Latest Posts</Title>
          </Col>
          <Col>
            {user && (
              <Link
                href={'/create-post'}
                onClick={() => track('latest posts click create post')}
                className={buttonClass('md', 'indigo')}
              >
                Create Post
              </Link>
            )}
          </Col>
        </Row>
        {posts ? <LatestPosts latestPosts={posts} /> : <LoadingIndicator />}
      </Col>
    </Page>
  )
}

export function LatestPosts(props: { latestPosts: TopLevelPost[] }) {
  const { latestPosts } = props
  return (
    <Col className="gap-2">
      {latestPosts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </Col>
  )
}
