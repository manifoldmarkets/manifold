import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Title } from 'web/components/widgets/title'
import { ActivityLog } from 'web/components/activity-log'
import { SEO } from 'web/components/SEO'
import { Row } from 'web/components/layout/row'
import { TopicSelector } from 'web/components/topics/topic-selector'
import { useState } from 'react'
import { Group } from 'common/group'
import { first } from 'lodash'

export default function LivePage() {
  const [topics, setTopics] = useState<Group[]>()
  const topic = first(topics)
  return (
    <Page trackPageView={'live page'}>
      <SEO
        title="Live"
        description="Watch all site activity live, including bets, comments, and new questions."
        url="/live"
      />

      <Col className="w-full max-w-3xl gap-4 self-center sm:pb-4">
        <Row className={'w-full items-center justify-between '}>
          <Title className="!mb-0 shrink-0">
            {topic ? topic.name + ' live' : 'Live'} feed
          </Title>
          <TopicSelector
            setSelectedGroup={(group) => setTopics([group])}
            className={'!w-56'}
          />
        </Row>
        <ActivityLog count={30} topicSlugs={topics?.map((t) => t.slug)} />
      </Col>
    </Page>
  )
}
