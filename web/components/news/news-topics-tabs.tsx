import { Col } from 'web/components/layout/col'
import { QueryUncontrolledTabs, Tab } from 'web/components/layout/tabs'
import { track } from 'web/lib/service/analytics'


export function NewsTopicsTabs(props: {
  topics: Tab[]
  dontScroll?: boolean
  onTabClick: (tabTitle: string, index: number) => void
}) {
  const { topics, dontScroll, onTabClick } = props
  return (
    <Col className="w-full gap-2 px-1 pb-8 sm:mx-auto sm:gap-6 sm:px-2 lg:pr-4">
      <QueryUncontrolledTabs
        className={'bg-canvas-50 sticky top-0 z-20 px-1'}
        scrollToTop={!dontScroll}
        tabs={topics.map((tab) => ({
          ...tab,
          onClick: () => {
            track('news topic clicked', { tab: tab.title })
          },
        }))}
        onClick={(tabTitle, index) => onTabClick(tabTitle, index)}
      />
    </Col>
  )
}
