import { Page } from 'web/components/layout/page'
import { PlusCircleIcon } from '@heroicons/react/outline'

import { getDateDocs } from 'web/lib/firebase/posts'
import type { DateDoc } from 'common/post'
import { Title } from 'web/components/widgets/title'
import { Spacer } from 'web/components/layout/spacer'
import { Col } from 'web/components/layout/col'
import { useUser } from 'web/hooks/use-user'
import { Row } from 'web/components/layout/row'
import { buttonClass } from 'web/components/buttons/button'
import { getUser, User } from 'web/lib/firebase/users'
import { DateDocPost } from './[username]'
import { NoSEO } from 'web/components/NoSEO'
import { useDateDocs } from 'web/hooks/use-post'
import { useTracking } from 'web/hooks/use-tracking'
import Link from 'next/link'
import clsx from 'clsx'

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
  const { docCreators } = props
  const user = useUser()

  const dateDocs = useDateDocs() ?? props.dateDocs
  const hasDoc = dateDocs.some((d) => d.creatorId === user?.id)
  useTracking('view date docs page')

  return (
    <Page>
      <NoSEO />
      <div className="mx-auto w-full max-w-xl">
        <Row className="items-center justify-between p-4 sm:p-0">
          <Title className="!my-0 px-2 text-blue-500" text="Date docs" />
          {!hasDoc && (
            <Link
              href="/date-docs/create"
              className={clsx(buttonClass('md', 'blue'), 'flex flex-row gap-1')}
            >
              <PlusCircleIcon
                className={'h-5 w-5 flex-shrink-0 text-white'}
                aria-hidden
              />
              New
            </Link>
          )}
        </Row>
        <Spacer h={6} />
        <Col className="gap-4">
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
