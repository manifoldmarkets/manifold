import clsx from 'clsx'
import { ReactNode } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { track } from 'web/lib/service/analytics'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'
import { useState } from 'react'
import { useRouter } from 'next/router'
import {
  UkraineWarData,
  RedditBlackoutData,
} from 'web/public/news-topics-data/newsTopicsData'

type Topic = {
  title: string
  content: ReactNode
  onClick?: (event?: any) => void
}

type NewsTopicsTabsProps = { homeContent: ReactNode }

export function TopicsTab({
  topics,
}: {
  topics: Topic[]

  setSelectedTab: (title: string) => void
}) {
  return (
    <QueryUncontrolledTabs
      tabs={topics.map((tab) => ({
        ...tab,
        onClick: () => {
          track('news topic clicked', { tab: tab.title })
        },
      }))}
    />
  )
}

export function NewsTopicsTabs({ homeContent }: NewsTopicsTabsProps) {
  const [selectedTab, setSelectedTab] = useState<string>('Home') // This selectedTab is needed and is being passed as a prop below. Not sure why VSCode is saying it can be removed.
  const router = useRouter()
  let defaultTab = router.query.tab ? String(router.query.tab) : 'Home'
  defaultTab = defaultTab
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')

  const topics = [
    {
      title: 'Home',
      content: homeContent,
    },
    {
      title: 'Ukraine War',
      content: <UkraineWarData />,
    },
    { title: 'draft', content: <p>yay</p> },
    { title: 'Reddit Blackout', content: <RedditBlackoutData /> },
    { title: 'Draft3', content: <p>aalots of markets about your</p> },
    { title: 'Draft4', content: <p>aalots of markets about </p> },
  ]

  return (
    <Col className="mx-auto w-full gap-2 pb-8 sm:gap-6 sm:px-2 lg:pr-4">
      <Row className="mx-2 items-center justify-between gap-4 sm:mx-0">
        <h1
          className={clsx(
            'text-primary-700 !my-0 mb-4 inline-block text-2xl  font-normal sm:mb-6 sm:block sm:text-3xl'
          )}
        >
          {defaultTab}
        </h1>
      </Row>
      <TopicsTab topics={topics} setSelectedTab={setSelectedTab} />{' '}
    </Col>
  )
}
