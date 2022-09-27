import { getDateDoc } from 'web/lib/firebase/posts'
import { LinkIcon } from '@heroicons/react/outline'
import { Page } from 'web/components/page'
import dayjs from 'dayjs'

import { DateDoc } from 'common/post'
import { Spacer } from 'web/components/layout/spacer'
import { Content } from 'web/components/editor'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { SiteLink } from 'web/components/site-link'
import { User } from 'web/lib/firebase/users'
import { DOMAIN } from 'common/envs/constants'
import Custom404 from '../404'
import { ShareIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Button } from 'web/components/button'
import { track } from '@amplitude/analytics-browser'
import toast from 'react-hot-toast'
import { copyToClipboard } from 'web/lib/util/copy'
import { useUser } from 'web/hooks/use-user'
import { RichEditPost } from '../post/[...slugs]'
import { usePost } from 'web/hooks/use-post'

export async function getStaticProps(props: { params: { username: string } }) {
  const { username } = props.params
  const { user, post } = (await getDateDoc(username)) ?? {
    user: null,
    post: null,
  }

  return {
    props: {
      user,
      post,
    },
    revalidate: 5, // regenerate after five seconds
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function DateDocPage(props: {
  user: User | null
  post: DateDoc | null
}) {
  const { user, post } = props

  if (!user || !post) return <Custom404 />

  return (
    <Page>
      <div className="mx-auto w-full max-w-xl">
        <DateDocPost dateDoc={post} creator={user} />
      </div>
    </Page>
  )
}

export function DateDocPost(props: {
  dateDoc: DateDoc
  creator: User
  link?: boolean
}) {
  const { dateDoc, creator, link } = props
  const { content, birthday, photoUrl, contractSlug } = dateDoc
  const { name, username } = creator

  const user = useUser()
  const post = usePost(dateDoc.id) ?? dateDoc

  const age = dayjs().diff(birthday, 'year')
  const shareUrl = `https://${DOMAIN}/date-docs/${username}`
  const marketUrl = `https://${DOMAIN}/${username}/${contractSlug}`

  return (
    <Col className="rounded-lg bg-white px-6 py-6">
      <SiteLink href={link ? `/date-docs/${creator.username}` : undefined}>
        <Col className="gap-4 self-center">
          <Row className="relative justify-between gap-4 text-2xl">
            <div>
              {name}, {age}
            </div>

            <Col className="absolute right-0 px-2">
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
          <img
            className="w-full max-w-lg rounded-lg object-cover"
            src={photoUrl}
            alt={name}
          />
        </Col>
      </SiteLink>
      <Spacer h={6} />
      {user && user.id === creator.id ? (
        <RichEditPost post={post} />
      ) : (
        <Content content={content} />
      )}
      <Spacer h={6} />
      <div className="mt-10 w-full max-w-lg self-center rounded-xl bg-gradient-to-r from-blue-200 via-purple-200 to-indigo-300 p-5">
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
