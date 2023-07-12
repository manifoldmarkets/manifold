import { Col } from 'web/components/layout/col'
import { useContracts } from 'web/hooks/use-contract-supabase'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { DashboardNewsItem } from 'web/components/news/dashboard-news-item'
import { Title } from 'web/components/widgets/title'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { useLinkPreviews } from 'web/hooks/use-link-previews'
import Masonry from 'react-masonry-css'

export const createNewsDashboardTab = (
  shortTitle: string,
  title: string,
  content: ({ url: string } | { slug: string } | { content: any })[]
) => {
  return {
    title: shortTitle,
    content: <NewsDashboard title={title} data={content} />,
  }
}

export const NewsDashboard = (props: {
  data: ({ url: string } | { slug: string } | { content: any })[]
  title: string
}) => {
  const { data, title } = props

  const slugs = data.map((x) => (x as any).slug).filter((x) => !!x)
  const contracts = useContracts(slugs, 'slug')

  const urls = data.map((x) => (x as any).url).filter((x) => !!x)
  const previews = useLinkPreviews(urls)
  const isLoading =
    (slugs.length > 0 && contracts.length === 0) ||
    (urls.length > 0 && previews.length === 0)

  const renderCard = (
    card: { url: string } | { slug: string } | { content: any },
    i: number
  ) => {
    if ('url' in card) {
      const preview = previews.find((p) => p.url === card.url)
      if (!preview) return undefined
      return (
        <DashboardNewsItem
          {...preview}
          className="mb-4"
          key={title + card.url}
        />
      )
    }

    if ('slug' in card) {
      const contract = contracts.find((c) => c.slug === card.slug)
      if (!contract) return undefined
      return (
        <FeedContractCard
          key={title + contract.id}
          contract={contract}
          className="mb-4"
        />
      )
    }

    return <div key={'news-tab-content' + title + i}>{card.content}</div>
  }

  const content = data.map(renderCard).filter((x) => !!x)

  return (
    <Col>
      <Title className="mb-4">{title}</Title>
      {isLoading ? <LoadingIndicator /> : <NewsGrid>{content}</NewsGrid>}
    </Col>
  )
}

export const NewsGrid = (props: { children: React.ReactNode }) => (
  <Masonry
    breakpointCols={{ default: 2, 768: 1 }}
    className="-ml-4 flex w-auto"
    columnClassName="pl-4 bg-clip-padding"
  >
    {props.children}
  </Masonry>
)
