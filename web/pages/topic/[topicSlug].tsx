import { Group, groupPath } from 'common/group'
import { removeUndefinedProps } from 'common/util/object'
import Link from 'next/link'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { Content } from 'web/components/widgets/editor'
import { Title } from 'web/components/widgets/title'
import { api } from 'web/lib/api/api'
import { getGroupFromSlug } from 'web/lib/supabase/group'

export async function getStaticProps(ctx: { params: { topicSlug: string } }) {
  const { topicSlug } = ctx.params
  const topic = await getGroupFromSlug(topicSlug)

  if (!topic) {
    return { notFound: true }
  }

  const { above, below } = await api('group/:slug/groups', { slug: topicSlug })

  return {
    props: {
      topic: removeUndefinedProps(topic),
      above,
      below,
    },
    revalidate: 240,
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function TopicPage(props: {
  topic: Group
  above: Group[]
  below: Group[]
}) {
  const { topic, above, below } = props

  return (
    <Page trackPageView={'group page'}>
      {/* <SEO title={group.name} description={group.about} /> */}
      <Row className="mx-auto w-full max-w-4xl gap-4">
        <Col className="flex-1">
          {/* {topic.bannerUrl && (
            <div className="relative h-[200px]">
              <Image
                fill
                src={topic.bannerUrl}
                sizes="100vw"
                className="object-cover"
                alt=""
              />
            </div>
          )} */}
          <Title>{topic.name}</Title>
          <Col className="w-full">
            <QueryUncontrolledTabs
              tabs={[
                {
                  title: 'About',
                  content: (
                    <Col className="w-full">
                      <div className="text-ink-500 mb-4 mt-2 text-sm">
                        {topic.privacyStatus} topic created
                        <RelativeTimestamp
                          time={topic.createdTime}
                          className="!text-ink-500"
                        />{' '}
                        • {topic.totalMembers ?? 0} followers
                      </div>

                      {topic.about && (
                        <Content
                          size="lg"
                          className="p-4 sm:p-6"
                          content={topic.about}
                        />
                      )}
                    </Col>
                  ),
                },
              ]}
            />
          </Col>
        </Col>

        <Col className="w-64 shrink-0">
          {above.length > 0 && (
            <>
              <div className="mb-2 font-semibold">Main topic</div>
              {above.map((g) => (
                <TopicRow key={g.id} topic={g} />
              ))}
            </>
          )}

          {below.length > 0 && (
            <>
              <div className="mb-2 mt-4 font-semibold">Subtopics</div>
              {below.map((g) => (
                <TopicRow key={g.id} topic={g} />
              ))}
            </>
          )}
        </Col>
      </Row>
    </Page>
  )
}

const TopicRow = (props: { topic: Group }) => {
  const { topic } = props
  return (
    <Link
      className="hover:bg-primary-100 active:bg-primary-200 flex items-center gap-2 rounded-md py-2 transition-colors"
      href={groupPath(topic.slug)}
    >
      <div className="flex-1">
        <div className="font-semibold">{topic.name}</div>
        <div className="text-ink-600 text-sm">
          {topic.totalMembers ?? 0} members
        </div>
      </div>
    </Link>
  )
}
