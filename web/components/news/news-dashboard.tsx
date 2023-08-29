import { ReactNode, useContext, useEffect } from 'react'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { Col } from 'web/components/layout/col'
import { DashboardNewsItem } from 'web/components/news/dashboard-news-item'
import { Title } from 'web/components/widgets/title'
import { useContracts } from 'web/hooks/use-contract-supabase'
import { useLinkPreviews } from 'web/hooks/use-link-previews'
import { LoadingIndicator } from '../widgets/loading-indicator'
import clsx from 'clsx'

export type NewsContentType = NewsLink | NewsQuestion
export type NewsLink = { url: string }
export type NewsQuestion = { slug: string }

export const createNewsDashboardTab = (
  shortTitle: string,
  title: string,
  content: NewsContentType[],
  description?: ReactNode
) => {
  const hasSlug = (content: NewsContentType): content is { slug: string } => {
    return 'slug' in content
  }
  const slugCards = content.filter(hasSlug)
  const otherCards = content.filter((card) => !hasSlug(card))
  return {
    title: shortTitle,
    content: <NewsDashboard title={title} data={slugCards} />,
    sidebar: <NewsSidebar description={description} data={otherCards} />,
  }
}

export const NewsSidebar = (props: {
  description?: ReactNode
  data: NewsLink[]
  title: string
}) => {
  const { data, title, description } = props

  if (!description && data.length === 0) return <></>

  const urls = data.map((x) => (x as any).url).filter((x) => !!x)
  const previews = useLinkPreviews(urls)
  const isLoading = urls.length > 0 && previews.length === 0

  const renderCard = (card: NewsLink, i: number) => {
    const preview = previews.find((p) => p.url === card.url)
    if (!preview) return undefined
    return (
      <DashboardNewsItem {...preview} className="mb-4" key={title + card.url} />
    )
  }

  const content = data.map(renderCard).filter((x) => !!x)
  return (
    <Col className="gap-4">
      {description && (
        <Col className="xl:bg-canvas-0 gap-2 xl:px-6 xl:py-4">
          <Col className=" text-primary-700">Additional Context</Col>
          {description}
        </Col>
      )}
      {isLoading ? <LoadingIndicator /> : <>{content}</>}
    </Col>
  )
}

export const NewsDashboard = (props: {
  description?: ReactNode
  data: NewsQuestion[]
  title: string
}) => {
  const { data, title, description } = props

  const slugs = data.map((x) => (x as any).slug).filter((x) => !!x)
  const contracts = useContracts(slugs, 'slug')
  const isLoading = slugs.length > 0 && contracts.length === 0

  const renderCard = (card: NewsQuestion, i: number) => {
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

  const getRelevantTime = (contract: any) =>
    contract.resolutionTime || contract.createdTime

  const sortedQuestions = data
    .map((card) => ({
      card,
      contract: contracts.find((contract) => contract.slug === card.slug),
    }))
    .filter(({ contract }) => !!contract)
    .sort((a, b) => getRelevantTime(b.contract!) - getRelevantTime(a.contract!))
    .map(({ card }) => card)

  const content = sortedQuestions.map(renderCard).filter((x) => !!x)
  return <Col>{isLoading ? <LoadingIndicator /> : <>{content}</>}</Col>
}
