import { ReactNode } from 'react'
import { Col } from 'web/components/layout/col'
import { track } from 'web/lib/service/analytics'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'
import { HomeIcon } from '@heroicons/react/solid'

import { newsContent } from 'web/components/news/news-content'
import { buildArray } from 'common/util/array'
import { AllArticles } from 'web/pages/news'

export function NewsTopicsTabs(props: {
  homeContent?: ReactNode
  questionsContent?: ReactNode
  dontScroll?: boolean
}) {
  const { homeContent, dontScroll } = props

  const topics = buildArray(
    !!homeContent && {
      title: 'For you',
      inlineTabIcon: <HomeIcon className="h-4 w-4" />,
      content: homeContent as JSX.Element,
    },
    ...newsContent,
    { title: 'All Articles', content: <AllArticles /> }
  )

  return (
    <Col className="w-full gap-2 px-2 pb-8 sm:mx-auto sm:gap-6 sm:px-2 lg:pr-4">
      <QueryUncontrolledTabs
        className={'bg-canvas-50 sticky top-0 z-20'}
        scrollToTop={!dontScroll}
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
