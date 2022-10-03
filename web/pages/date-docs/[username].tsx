import { getDateDoc } from 'web/lib/firebase/posts'
import { ArrowLeftIcon, LinkIcon } from '@heroicons/react/outline'
import { Page } from 'web/components/page'
import dayjs from 'dayjs'
import toast from 'react-hot-toast'
import clsx from 'clsx'

import { DateDoc } from 'common/post'
import { Content } from 'web/components/editor'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { SiteLink } from 'web/components/site-link'
import { User } from 'web/lib/firebase/users'
import { DOMAIN } from 'common/envs/constants'
import Custom404 from '../404'
import { ShareIcon } from '@heroicons/react/solid'
import { Button } from 'web/components/button'
import { track } from '@amplitude/analytics-browser'
import { copyToClipboard } from 'web/lib/util/copy'
import { useUser } from 'web/hooks/use-user'
import { PostCommentsActivity, RichEditPost } from '../post/[...slugs]'
import { usePost } from 'web/hooks/use-post'
import { useTipTxns } from 'web/hooks/use-tip-txns'
import { useCommentsOnPost } from 'web/hooks/use-comments'

export async function getStaticProps(props: { params: { username: string } }) {
  const { username } = props.params
  const { user: creator, post } = (await getDateDoc(username)) ?? {
    creator: null,
    post: null,
  }

  return {
    props: {
      creator,
      post,
    },
    revalidate: 5, // regenerate after five seconds
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function DateDocPageHelper(props: {
  creator: User | null
  post: DateDoc | null
}) {
  const { creator, post } = props

  if (!creator || !post) return <Custom404 />

  return <DateDocPage creator={creator} post={post} />
}

function DateDocPage(props: { creator: User; post: DateDoc }) {
  const { creator, post } = props

  const tips = useTipTxns({ postId: post.id })
  const comments = useCommentsOnPost(post.id) ?? []

  return (
    <Page>
      <Col className="mx-auto w-full max-w-xl gap-6 sm:mb-6">
        <SiteLink href="/date-docs">
          <Row className="items-center gap-2">
            <ArrowLeftIcon className="h-5 w-5" aria-hidden="true" />
            <div>Date docs</div>
          </Row>
        </SiteLink>
        <DateDocPost dateDoc={post} creator={creator} />
        <Col className="gap-4 rounded-lg bg-white px-6 py-4">
          <div className="">Add your endorsement of {creator.name}!</div>
          <PostCommentsActivity post={post} comments={comments} tips={tips} />
        </Col>
      </Col>
    </Page>
  )
}

export function DateDocPost(props: {
  dateDoc: DateDoc
  creator: User
  link?: boolean
}) {
  const { dateDoc, creator, link } = props
  const { content, birthday, contractSlug } = dateDoc
  const { name, username } = creator

  const user = useUser()
  const post = usePost(dateDoc.id) ?? dateDoc

  const age = dayjs().diff(birthday, 'year')
  const shareUrl = `https://${DOMAIN}/date-docs/${username}`
  const marketUrl = `https://${DOMAIN}/${username}/${contractSlug}`

  return (
    <Col className="gap-6 rounded-lg bg-white px-6 py-6">
      <SiteLink href={link ? `/date-docs/${creator.username}` : undefined}>
        <Col className="gap-6">
          <Row className="relative justify-between gap-4 text-2xl">
            <div>
              {name}, {age}
            </div>

            <Col className={clsx(link && 'absolute', 'right-0 px-2')}>
              <Button
                size="lg"
                color="gray-white"
                className={'flex'}
                onClick={(e) => {
                  e.preventDefault()
                  copyToClipboard(shareUrl)
                  toast.success('Link copied!', {
                    icon: (
                      <LinkIcon className="mr-2 h-6 w-6" aria-hidden="true" />
                    ),
                  })
                  track('copy share post link')
                }}
              >
                <ShareIcon
                  className={clsx('mr-2 h-[24px] w-5')}
                  aria-hidden="true"
                />
                <div
                  className="!hover:no-underline !decoration-0"
                  style={{ textDecoration: 'none' }}
                >
                  Share
                </div>
              </Button>
            </Col>
          </Row>
        </Col>
      </SiteLink>
      {user && user.id === creator.id ? (
        <RichEditPost post={post} />
      ) : (
        <Content content={content} />
      )}
      <div className="mt-4 w-full max-w-lg self-center rounded-xl bg-gradient-to-r from-blue-200 via-purple-200 to-indigo-300 p-3">
        <iframe
          height="405"
          src={marketUrl}
          title=""
          frameBorder="0"
          className="w-full rounded-xl bg-white p-10"
        ></iframe>
      </div>
    </Col>
  )
}
