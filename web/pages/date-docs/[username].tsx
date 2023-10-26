import { getDateDoc } from 'web/lib/supabase/post'
import { ArrowLeftIcon, LinkIcon } from '@heroicons/react/outline'
import { Page } from 'web/components/layout/page'
import dayjs from 'dayjs'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { DateDoc } from 'common/post'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import Link from 'next/link'
import { User } from 'web/lib/firebase/users'
import { DOMAIN } from 'common/envs/constants'
import Custom404 from '../404'
import { ShareIcon } from '@heroicons/react/solid'
import { Button } from 'web/components/buttons/button'
import { track } from 'web/lib/service/analytics'
import { copyToClipboard } from 'web/lib/util/copy'
import { useUser } from 'web/hooks/use-user'
import { PostCommentsActivity, RichEditPost } from '../post/[slug]/index'
import { NoSEO } from 'web/components/NoSEO'
import { usePost } from 'web/hooks/use-post-supabase'
import { getCommentsOnPost } from 'web/lib/supabase/comments'
import { PostComment } from 'common/comment'
import { useRealtimePostComments } from 'web/hooks/use-comments-supabase'

export async function getStaticProps(props: { params: { username: string } }) {
  const { username } = props.params
  const { user: creator, post } = (await getDateDoc(username)) ?? {
    creator: null,
    post: null,
  }

  const comments = post && (await getCommentsOnPost(post.id))

  return {
    props: {
      creator,
      post,
      comments,
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
  comments?: PostComment[]
}) {
  const { creator, post, comments = [] } = props

  if (!creator || !post) return <Custom404 />

  return <DateDocPage creator={creator} post={post} comments={comments} />
}

function DateDocPage(props: {
  creator: User
  post: DateDoc
  comments: PostComment[]
}) {
  const { creator, post } = props
  const comments = useRealtimePostComments(post.id) || props.comments

  return (
    <Page
      trackPageView={'user date doc page'}
      trackPageProps={{ username: creator.username }}
    >
      <NoSEO />
      <Col className="mx-auto w-full max-w-xl gap-6 sm:mb-6">
        <Link href="/date-docs">
          <Row className="items-center gap-2">
            <ArrowLeftIcon className="h-5 w-5" aria-hidden="true" />
            <div>Date docs</div>
          </Row>
        </Link>
        <DateDocPost dateDoc={post} creator={creator} />
        <Col className="bg-canvas-0 gap-4 rounded-lg px-6 py-4">
          <div className="">Add your endorsement of {creator.name}!</div>
          <PostCommentsActivity post={post} comments={comments} />
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
  const { birthday, contractSlug } = dateDoc
  const { name, username } = creator

  const user = useUser()
  const post = usePost(dateDoc.id) ?? dateDoc

  const age = dayjs().diff(birthday, 'year')
  const shareUrl = `https://${DOMAIN}/date-docs/${username}`
  const marketUrl = `https://${DOMAIN}/${username}/${contractSlug}`

  return (
    <Col className="bg-canvas-0 gap-6 rounded-lg px-6 py-6">
      <MaybeLink href={link ? `/date-docs/${creator.username}` : undefined}>
        <Col className="gap-6">
          <Row className="relative items-center justify-between gap-4 text-2xl">
            <div>
              {name}, {age}
            </div>

            <Col>
              <Button
                size="lg"
                color="gray-white"
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
                <div>Share</div>
              </Button>
            </Col>
          </Row>
        </Col>
      </MaybeLink>
      <RichEditPost post={post} canEdit={!!user && user.id === creator.id} />
      {contractSlug && (
        <div className="to-primary-300 mt-4 w-full max-w-lg self-center rounded-xl bg-gradient-to-r from-blue-200 via-purple-200 p-3">
          <iframe
            height="405"
            src={marketUrl}
            title=""
            frameBorder="0"
            className="bg-canvas-0 w-full rounded-xl p-10"
          ></iframe>
        </div>
      )}
    </Col>
  )
}

const MaybeLink = (props: { href?: string; children: React.ReactNode }) => {
  const { href, children } = props
  if (!href) return <>{children}</>

  return <Link href={href}>{children}</Link>
}
