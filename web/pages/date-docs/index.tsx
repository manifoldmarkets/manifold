import { Page } from 'web/components/page'
import { PlusCircleIcon } from '@heroicons/react/outline'
import dayjs from 'dayjs'

import { getDateDocs } from 'web/lib/firebase/posts'
import { DateDoc } from 'common/post'
import { Title } from 'web/components/title'
import { Spacer } from 'web/components/layout/spacer'
import { Content } from 'web/components/editor'
import { Col } from 'web/components/layout/col'
import { useUser } from 'web/hooks/use-user'
import { Row } from 'web/components/layout/row'
import { Button } from 'web/components/button'
import { SiteLink } from 'web/components/site-link'
import { getUser, User } from 'web/lib/firebase/users'
import { DOMAIN } from 'common/envs/constants'

export async function getStaticProps() {
  const dateDocs = await getDateDocs()
  const docCreators = await Promise.all(
    dateDocs.map((d) => getUser(d.creatorId))
  )

  return {
    props: {
      dateDocs,
      docCreators,
    },

    revalidate: 60, // regenerate after a minute
  }
}

export default function DatePage(props: {
  dateDocs: DateDoc[]
  docCreators: User[]
}) {
  const { dateDocs, docCreators } = props
  const user = useUser()

  const hasDoc = dateDocs.some((d) => d.creatorId === user?.id)

  return (
    <Page>
      <div className="mx-auto w-full max-w-3xl">
        <Row className="items-center justify-between">
          <Title className="!my-0 px-2 text-blue-500" text="Date docs" />
          {!hasDoc && (
            <SiteLink href="/date/create" className="!no-underline">
              <Button className="flex flex-row gap-1" color="blue">
                <PlusCircleIcon
                  className={'h-5 w-5 flex-shrink-0 text-white'}
                  aria-hidden="true"
                />
                New
              </Button>
            </SiteLink>
          )}
        </Row>
        <Spacer h={6} />
        <Col className="gap-4">
          {dateDocs.map((dateDoc, i) => (
            <DateDoc
              key={dateDoc.id}
              dateDoc={dateDoc}
              creator={docCreators[i]}
            />
          ))}
        </Col>
      </div>
    </Page>
  )
}

function DateDoc(props: { dateDoc: DateDoc; creator: User }) {
  const { dateDoc, creator } = props
  const { content, birthday, photoUrl, contractSlug } = dateDoc
  const { name, username } = creator

  const age = dayjs().diff(birthday, 'year')
  const marketUrl = `https://${DOMAIN}/${username}/${contractSlug}`

  return (
    <Col className="rounded-lg bg-white px-6 py-6">
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
