import { ReactNode } from 'react'
import { Col } from 'web/components/layout/col'
import { track } from 'web/lib/service/analytics'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'

import { newsContent } from 'web/components/news/news-content'
import { buildArray } from 'common/util/array'
import { AllArticles } from 'web/pages/news'
import { LiveFeed } from 'web/pages/live'

export function NewsTopicsTabs(props: {
  homeContent?: ReactNode
  questionsContent?: ReactNode
}) {
  const { homeContent, questionsContent } = props

  const topics = buildArray(
    !!homeContent && { title: 'Feed', content: homeContent as JSX.Element },
    !!questionsContent && { title: 'Browse', content: questionsContent },
    !!homeContent && { title: 'Live', content: <LiveFeed /> },
    ...newsContent,
    { title: 'All Articles', content: <AllArticles /> }
  )

  return (
    <Col className="w-full gap-2 px-2 pb-8 sm:mx-auto sm:gap-6 sm:px-2 lg:pr-4">
      <QueryUncontrolledTabs
        className={'bg-canvas-50 sticky top-0 z-20'}
        scrollToTop
        tabs={topics.map((tab) => ({
          ...tab,
          onClick: () => {
            track('news topic clicked', { tab: tab.title })
          },
        }))}
      />
    </Col>
  )
}
