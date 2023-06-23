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

export function NewsTopicsTabs(props: {
  homeContent?: ReactNode
  articlesContent?: ReactNode
}) {
  const { homeContent, articlesContent } = props

  const topics = buildArray(
    !!homeContent && { title: 'Home', content: homeContent },
    { title: 'Ukraine War', content: <UkraineWarData /> },
    { title: 'Elon v Zuck', content: <ElonVersusZuckData /> },
    { title: 'Titanic Sub', content: <MissingSubData /> },
    { title: 'Reddit Blackout', content: <RedditBlackoutData /> },
    { title: 'US Elections', content: <UsElectionsData /> },
    !!articlesContent && { title: 'All Articles', content: articlesContent }
  )

  return (
    <Col className="mx-auto w-full gap-2 pb-8 sm:gap-6 sm:px-2 lg:pr-4">
      <QueryUncontrolledTabs
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
