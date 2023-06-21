import { ReactNode } from 'react'
import { Col } from 'web/components/layout/col'
import { track } from 'web/lib/service/analytics'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'

import {
  UkraineWarData,
  RedditBlackoutData,
  MissingSubData,
  UsElectionsData,
} from 'web/components/news-topics-data'

export function NewsTopicsTabs({ homeContent }: { homeContent: ReactNode }) {
  const topics = [
    { title: 'Home', content: homeContent },
    { title: 'Titanic Sub', content: <MissingSubData /> },
    { title: 'Ukraine War', content: <UkraineWarData /> },
    { title: 'Reddit Blackout', content: <RedditBlackoutData /> },
    { title: 'US Elections', content: <UsElectionsData /> },
  ]

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
