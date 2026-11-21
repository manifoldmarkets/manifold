import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { ActivityLog } from 'web/components/activity-log'
import { SEO } from 'web/components/SEO'
import { usePersistentQueryState } from 'web/hooks/use-persistent-query-state'
import { useTopicFromRouter } from 'web/hooks/use-topic-from-router'
import { TRADE_TERM } from 'common/envs/constants'

export default function LivePage() {
  const [topicSlug, setTopicSlug] = usePersistentQueryState('topic', '')
  const topicFromRouter = useTopicFromRouter(topicSlug)
  return (
    <Page trackPageView={'live page'}>
      <SEO
        title="Live"
        description={`Watch all site activity live, including ${TRADE_TERM}s, comments, and new questions.`}
        url="/live"
      />

      <Col className="w-full max-w-3xl gap-4 self-center sm:pb-4">
        <span className="text-primary-700 line-clamp-1 shrink px-1 pt-1 text-2xl">
          {topicFromRouter ? topicFromRouter.name : 'Site'} activity feed
        </span>
        <ActivityLog
          count={30}
          topicSlugs={topicSlug ? [topicSlug] : undefined}
          showHideApiTrades
          showTopicFilter
          selectedTopic={topicFromRouter}
          onSelectTopic={(group) => setTopicSlug(group.slug)}
          onClearTopic={() => setTopicSlug('')}
        />
      </Col>
    </Page>
  )
}
