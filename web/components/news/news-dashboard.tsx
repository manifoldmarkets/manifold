import { ReactNode } from 'react'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { Col } from 'web/components/layout/col'
import { DashboardNewsItem } from 'web/components/news/dashboard-news-item'
import { Title } from 'web/components/widgets/title'
import { useContracts } from 'web/hooks/use-contract-supabase'
import { useLinkPreviews } from 'web/hooks/use-link-previews'
import { LoadingIndicator } from '../widgets/loading-indicator'

export type NewsContentType = NewsLink | NewsQuestion
export type NewsLink = { url: string }
export type NewsQuestion = { slug: string }

export const createNewsDashboardTab = (
  shortTitle: string,
  title: string,
  content: NewsContentType[],
  description?: ReactNode
) => {
  return {
    title: shortTitle,
    content: (
      <Col>
        <Title>{title}</Title>
        <div className="xl:hidden">
          <NewsSidebar description={description} title={title} />
        </div>
        <NewsDashboard title={title} data={content} />
      </Col>
    ),
    sidebar: (
      <div className="hidden xl:inline-flex">
        <NewsSidebar description={description} title={title} />
      </div>
    ),
  }
}

export const NewsSidebar = (props: {
  description?: ReactNode
  title: string
}) => {
  const { title, description } = props

  if (!description) return <></>

  return (
    <Col>
      {description && (
        <Col className=" text-primary-700 mb-2 hidden xl:inline-flex">
          Additional Context
        </Col>
      )}
      {description && (
        <>
          <Col className="bg-canvas-0 mb-4 gap-2 py-2 px-4 xl:px-6 xl:py-4">
            {description}
          </Col>
        </>
      )}
    </Col>
  )
}

export const NewsDashboard = (props: {
  description?: ReactNode
  data: NewsContentType[]
  title: string
}) => {
  const { data, title, description } = props

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
  }

  const content = data.map(renderCard).filter((x) => !!x)
  return <Col>{isLoading ? <LoadingIndicator /> : <>{content}</>}</Col>
}
