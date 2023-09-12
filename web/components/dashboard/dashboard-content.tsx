import { useContracts } from 'web/hooks/use-contract-supabase'
import { useLinkPreviews } from 'web/hooks/use-link-previews'
import { DashboardNewsItem } from '../news/dashboard-news-item'
import { FeedContractCard } from '../contract/feed-contract-card'
import { Col } from '../layout/col'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { ReactNode } from 'react'
import { XCircleIcon } from '@heroicons/react/solid'

export type DashboardItem = DashboardQuestionItem | DashboardLinkItem

export type DashboardQuestionItem = {
  type: 'question'
  slug: string
}

export type DashboardLinkItem = {
  type: 'link'
  url: string
}

export const DashboardContent = (props: {
  items: DashboardItem[]
  onRemove: (slugOrUrl: string) => void
  isEditing?: boolean
}) => {
  const { items, isEditing, onRemove } = props

  const slugs = items.map((x) => (x as any).slug).filter((x) => !!x)
  const contracts = useContracts(slugs, 'slug')

  const urls = items.map((x) => (x as any).url).filter((x) => !!x)
  const previews = useLinkPreviews(urls)
  const isLoading =
    (slugs.length > 0 && contracts.length === 0) ||
    (urls.length > 0 && previews.length === 0)

  const renderCard = (
    card: { url: string } | { slug: string } | { content: any }
  ) => {
    if ('url' in card) {
      const preview = previews.find((p) => p.url === card.url)
      if (!preview) return undefined
      return (
        <DashboardContentFrame
          isEditing={isEditing}
          onRemove={onRemove}
          slugOrUrl={preview.url}
        >
          <DashboardNewsItem {...preview} className="mb-4" key={card.url} />
        </DashboardContentFrame>
      )
    }

    if ('slug' in card) {
      const contract = contracts.find((c) => c.slug === card.slug)
      if (!contract) return undefined
      return (
        <DashboardContentFrame
          isEditing={isEditing}
          onRemove={onRemove}
          slugOrUrl={contract.slug}
        >
          <FeedContractCard
            key={contract.id}
            contract={contract}
            className="mb-4"
          />
        </DashboardContentFrame>
      )
    }
  }

  const content = items.map(renderCard).filter((x) => !!x)
  return <Col>{isLoading ? <LoadingIndicator /> : <>{content}</>}</Col>
}

function DashboardContentFrame(props: {
  children: ReactNode
  onRemove: (slugOrUrl: string) => void
  slugOrUrl: string
  isEditing?: boolean
}) {
  const { children, isEditing, onRemove, slugOrUrl } = props
  if (!isEditing) {
    return <>{children}</>
  }
  return (
    <div className={'relative'}>
      <button
        className="text-ink-500 hover:text-ink-700 absolute -top-2 right-0 z-50 transition-colors"
        onClick={() => onRemove(slugOrUrl)}
      >
        <XCircleIcon className=" h-5 w-5" />
      </button>
      <div className="relative">
        <div className="absolute top-0 left-0 right-0 bottom-0 z-40 rounded-lg bg-white opacity-10" />
        <div
          className="pointer-events-none"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
