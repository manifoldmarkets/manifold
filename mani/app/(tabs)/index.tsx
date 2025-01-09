import { Feed } from 'components/home/feed'
import { TopTabs } from 'components/layout/top-tabs'
import Page from 'components/page'

export type HomeTabs = 'home' | 'news' | 'sports' | 'politics' | 'entertainment'

export default function HomeScreen() {
  return (
    <Page>
      <TopTabs
        tabs={[
          {
            title: 'Live',
            content: <Feed tab="live" />,
          },
          {
            title: 'Sports',
            content: <Feed tab="sports" />,
          },
          {
            title: 'News',
            content: <Feed tab="news" />,
          },
          {
            title: 'Entertainment',
            content: <Feed tab="entertainment" />,
          },
          {
            title: 'Politics',
            content: <Feed tab="politics" />,
          },
        ]}
      />
    </Page>
  )
}
