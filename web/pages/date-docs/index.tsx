import { Page } from 'web/components/layout/page'
import type { DateDoc } from 'common/post'
import { Title } from 'web/components/widgets/title'
import { Col } from 'web/components/layout/col'
import { useUser } from 'web/hooks/use-user'
import { Row } from 'web/components/layout/row'
import { buttonClass } from 'web/components/buttons/button'
import { getUser, User } from 'web/lib/firebase/users'
import { DateDocPost } from './[username]'
import { NoSEO } from 'web/components/NoSEO'
import { useTracking } from 'web/hooks/use-tracking'
import Link from 'next/link'
import clsx from 'clsx'
import { getDateDocs } from 'web/lib/supabase/post'

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
  const { docCreators, dateDocs } = props
  const user = useUser()

  const hasDoc = dateDocs.some((d) => d.creatorId === user?.id)
  useTracking('view date docs page')

  return (
    <Page>
      <NoSEO />
      <div className="mx-auto w-full max-w-xl">
        <Row className="mb-6 items-center justify-between p-4 sm:p-0">
          <Title className="!my-0 px-2">Date docs</Title>
          {!hasDoc && (
            <Link
              href="/date-docs/create"
              className={clsx(
                buttonClass('md', 'indigo'),
                'flex flex-row gap-1'
              )}
            >
              Create one!
            </Link>
          )}
        </Row>
        <Col className="gap-6">
          {dateDocs.map((dateDoc, i) => (
            <DateDocPost
              key={dateDoc.id}
              dateDoc={dateDoc}
              creator={docCreators[i]}
              link
            />
          ))}
        </Col>
      </div>
    </Page>
  )
}
