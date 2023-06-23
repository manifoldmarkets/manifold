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
  RussianCoupData,
} from 'web/components/news-topics-data'
import { buildArray } from 'common/util/array'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { AllArticles } from 'web/pages/news'

export function NewsTopicsTabs(props: {
  homeContent?: ReactNode
  questionsContent?: ReactNode
}) {
  const { homeContent, questionsContent } = props
  const isMobile = useIsMobile()

  const newsContent = [
    { title: 'Russian Coup?', content: <RussianCoupData /> },
    { title: 'Elon v Zuck', content: <ElonVersusZuckData /> },
    { title: 'Titanic Sub', content: <MissingSubData /> },
    { title: 'Reddit Blackout', content: <RedditBlackoutData /> },
    { title: 'Ukraine War', content: <UkraineWarData /> },
    { title: 'US Elections', content: <UsElectionsData /> },
    { title: 'All Articles', content: <AllArticles /> },
  ]

  const topics = buildArray(
    !!homeContent && { title: 'Timeline', content: homeContent },
    !!questionsContent && { title: 'All', content: questionsContent },
    !isMobile
      ? newsContent
      : {
          title: 'News',
          content: <Col className='m-1'>{newsContent.map((tab) => tab.content)}</Col>,
        }
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