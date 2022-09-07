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

export async function getStaticProps(props: { params: { slugs: string[] } }) {
  const { slugs } = props.params

  const post = await getPostBySlug(slugs[0])
  const creator = post ? await getUser(post.creatorId) : null

  return {
    props: {
      post: post,
      creator: creator,
    },

    revalidate: 60, // regenerate after a minute
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function PostPage(props: { post: Post; creator: User }) {
  const [isShareOpen, setShareOpen] = useState(false)

  if (props.post == null) {
    return <Custom404 />
  }

  const shareUrl = `https://${ENV_CONFIG.domain}${postPath(props?.post.slug)}`

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
      </div>
    </Page>
  )
}
