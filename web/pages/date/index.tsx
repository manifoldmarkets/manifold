import { Page } from 'web/components/page'
import { PlusCircleIcon } from '@heroicons/react/outline'

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

export async function getStaticProps() {
  const dateDocs = await getDateDocs()

  return {
    props: {
      dateDocs,
    },

    revalidate: 60, // regenerate after a minute
  }
}

export default function DatePage(props: { dateDocs: DateDoc[] }) {
  const { dateDocs } = props
  const user = useUser()

  return (
    <Page>
      <div className="mx-auto w-full max-w-3xl ">
        <Row className="items-center justify-between">
          <Title className="!my-0 px-2 text-blue-500" text="Date docs" />
          <SiteLink href="/date/create" className="!no-underline">
            <Button className="flex flex-row gap-1" color="blue">
              <PlusCircleIcon
                className={'h-5 w-5 flex-shrink-0 text-white'}
                aria-hidden="true"
              />
              New
            </Button>
          </SiteLink>
        </Row>
        <Spacer h={2} />
        <Col className="gap-4">
          {dateDocs.map((dateDoc) => (
            <DateDoc key={dateDoc.id} dateDoc={dateDoc} />
          ))}
        </Col>
      </div>
    </Page>
  )
}

function DateDoc(props: { dateDoc: DateDoc }) {
  const { dateDoc } = props
  const { content } = dateDoc

  return (
    <div className="rounded-lg bg-white px-6 py-4 sm:py-0">
      <div className="form-control w-full py-2">
        <Content content={content} />
      </div>
    </div>
  )
}
