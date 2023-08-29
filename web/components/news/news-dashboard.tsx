import { ReactNode, useContext, useEffect } from 'react'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { Col } from 'web/components/layout/col'
import { DashboardNewsItem } from 'web/components/news/dashboard-news-item'
import { Title } from 'web/components/widgets/title'
import { useContracts } from 'web/hooks/use-contract-supabase'
import { useLinkPreviews } from 'web/hooks/use-link-previews'
import { LoadingIndicator } from '../widgets/loading-indicator'
import clsx from 'clsx'

export type NewsContentType = { url: string } | { slug: string }

export const createNewsDashboardTab = (
  shortTitle: string,
  title: string,
  content: NewsContentType[],
  description?: ReactNode
) => {
  return {
    title: shortTitle,
    content: (
      <NewsDashboard title={title} description={description} data={content} />
    ),
    sidebar: description,
  }
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

    return <div key={'news-tab-content' + title + i}>{card.content}</div>
  }

  const getRelevantTime = (contract: any) =>
    contract.resolutionTime || contract.createdTime

  const hasSlug = (content: NewsContentType): content is { slug: string } => {
    return 'slug' in content
  }

  // Use the custom type guard 'hasSlug' to filter out slugCards
  const slugCards = data.filter(hasSlug)

  // And similarly, you can safely filter out other types of cards
  const otherCards = data.filter((card) => !hasSlug(card))

  const sortedSlugCards = slugCards
    .map((card) => ({
      card,
      contract: contracts.find((contract) => contract.slug === card.slug),
    }))
    .filter(({ contract }) => !!contract)
    .sort((a, b) => getRelevantTime(b.contract!) - getRelevantTime(a.contract!))
    .map(({ card }) => card)

  const sortedData = [...otherCards, ...sortedSlugCards]

  const content = sortedData.map(renderCard).filter((x) => !!x)
  return (
    <Col>
      <Title className={clsx(description ? 'mb-2' : 'mb-4')}>{title}</Title>
      {/* {description && <div className="mb-4">{description}</div>} */}
      {isLoading ? <LoadingIndicator /> : <>{content}</>}
    </Col>
  )
}
