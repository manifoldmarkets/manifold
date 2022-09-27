import { getDateDoc } from 'web/lib/firebase/posts'
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
  const { dateDoc, creator } = props
  const { content, birthday, photoUrl, contractSlug } = dateDoc
  const { name, username } = creator

  const age = dayjs().diff(birthday, 'year')
  const marketUrl = `https://${DOMAIN}/${username}/${contractSlug}`

  return (
    <Col className="rounded-lg bg-white px-6 py-6">
      <SiteLink
        href={props.link ? `/date-docs/${creator.username}` : undefined}
      >
        <Col className="gap-2 self-center">
          <Row>
            <img
              className="w-full max-w-lg rounded-lg object-cover"
              src={photoUrl}
              alt={name}
            />
          </Row>
          <Row className="gap-4 text-2xl">
            <div>
              {name}, {age}
            </div>
          </Row>
        </Col>
      </SiteLink>
      <Spacer h={6} />
      <Content content={content} />
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
