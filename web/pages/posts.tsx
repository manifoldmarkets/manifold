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
import { getAllPosts, useLatestPosts } from 'web/lib/supabase/posts'
import { useState } from 'react'
import { Button } from 'web/components/buttons/button'

export async function getStaticProps() {
  const bestPosts = await getAllPosts('importance_score')
  return {
    props: {
      bestPosts,
    },
    revalidate: 60, // Revalidate every minute
  }
}

export default function PostsPage(props: { bestPosts: TopLevelPost[] }) {
  const { bestPosts } = props
  const user = useUser()
  const [sortBy, setSortBy] = useState<'latest' | 'best'>('best')
  const latestPosts = useLatestPosts()
  const posts = sortBy === 'latest' ? latestPosts : bestPosts

  return (
    <Page trackPageView={'latest posts page'}>
      <Col className=" px-2 py-3">
        <Row className="my-4 items-start justify-between sm:mt-0">
          <Col>
            <Title className="mx-4 !mb-0 sm:mx-0">
              {sortBy === 'latest' ? 'Latest Posts' : 'Best Posts'}
            </Title>
            <Row className="mx-4 mt-2 gap-2 sm:mx-0">
              <Button
                size="xs"
                color={sortBy === 'best' ? 'indigo' : 'gray-outline'}
                onClick={() => setSortBy('best')}
              >
                Best
              </Button>
              <Button
                size="xs"
                color={sortBy === 'latest' ? 'indigo' : 'gray-outline'}
                onClick={() => setSortBy('latest')}
              >
                Latest
              </Button>
            </Row>
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
        {posts ? <Posts posts={posts} /> : <LoadingIndicator />}
      </Col>
    </Page>
  )
}

export function Posts(props: { posts: TopLevelPost[] }) {
  const { posts } = props
  return (
    <Col className="gap-2">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </Col>
  )
}
