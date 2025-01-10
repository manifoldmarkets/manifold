import { Feed } from 'components/home/feed'
import { ControlledTopTabs } from 'components/layout/top-tabs'
import Page from 'components/page'
import { useState } from 'react'

export type HomeTabs = 'home' | 'news' | 'sports' | 'politics' | 'entertainment'

const TOP_LEVEL_TABS = [
  {
    title: 'Live',
    content: <Feed tab="live" />,
    iconName: 'livephoto',
  },
  {
    title: 'Sports',
    content: <Feed tab="sports" />,
    iconName: 'basketball',
  },
  {
    title: 'News',
    content: <Feed tab="news" />,
    iconName: 'newspaper',
  },
  {
    title: 'Entertainment',
    content: <Feed tab="entertainment" />,
    iconName: 'movieclapper',
  },
  {
    title: 'Politics',
    content: <Feed tab="politics" />,
    iconName: 'globe',
  },
]

export default function HomeScreen() {
  const [activeIndex, setActiveIndex] = useState(0)
  const [activeSportsIndex, setActiveSportsIndex] = useState(0)

  const SPORTS_TABS = [
    {
      title: 'Back',
      content: null,
      iconName: 'chevron.left',
      isBackButton: true,
      onPress: () => setActiveIndex(0),
    },
    {
      title: 'NFL',
      content: <Feed tab="NFL" />,
      iconName: 'football',
    },
    {
      title: 'NBA',
      content: <Feed tab="NBA" />,
      iconName: 'basketball',
    },
    {
      title: 'EPL',
      content: <Feed tab="EPL" />,
      iconName: 'soccerball',
    },
    {
      title: 'MLB',
      content: <Feed tab="MLB" />,
      iconName: 'baseball',
    },
    {
      title: 'NHL',
      content: <Feed tab="NHL" />,
      iconName: 'hockey.puck',
    },
  ]

  const sportsIndex = TOP_LEVEL_TABS.findIndex((tab) => tab.title === 'Sports')
  const isSports = activeIndex === sportsIndex
  return (
    <Page>
      <ControlledTopTabs
        activeIndex={isSports ? activeSportsIndex : activeIndex}
        onActiveIndexChange={isSports ? setActiveSportsIndex : setActiveIndex}
        tabs={isSports ? SPORTS_TABS : TOP_LEVEL_TABS}
      />
    </Page>
  )
}
