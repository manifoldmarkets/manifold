import { ReactNode } from 'react'
import { Col } from 'web/components/layout/col'
import { track } from 'web/lib/service/analytics'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'

import {
  UkraineWarData,
  RedditBlackoutData,
  MissingSubData,
  UsElectionsData,
  ElonVersusZuckData,
} from 'web/components/news-topics-data'
import { buildArray } from 'common/util/array'
import { useIsMobile } from 'web/hooks/use-is-mobile'

export function NewsTopicsTabs(props: {
  homeContent?: ReactNode
  questionsContent?: ReactNode
  articlesContent?: ReactNode
}) {
  const { homeContent, questionsContent, articlesContent } = props
  const isMobile = useIsMobile()

  const topics = buildArray(
    !!homeContent && { title: 'Timeline', content: homeContent },
    !!questionsContent && { title: 'All', content: questionsContent },
    !isMobile
      ? [
          { title: 'Elon v Zuck', content: <ElonVersusZuckData /> },
          { title: 'Titanic Sub', content: <MissingSubData /> },
          { title: 'Ukraine War', content: <UkraineWarData /> },
          { title: 'Reddit Blackout', content: <RedditBlackoutData /> },
          { title: 'US Elections', content: <UsElectionsData /> },
        ]
      : {
          title: 'News',
          content: (
            <Col>
              <ElonVersusZuckData />
              <MissingSubData />
              <UkraineWarData />
              <RedditBlackoutData />
              <UsElectionsData />
            </Col>
          ),
        },
    !!articlesContent && { title: 'All Articles', content: articlesContent }
  )

  return (
    <Col className="mx-auto w-full gap-2 pb-8 sm:gap-6 sm:px-2 lg:pr-4">
      <QueryUncontrolledTabs
        labelClassName={'pb-3 pt-0'}
        className={'bg-canvas-50 sticky top-0 z-20'}
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
