import { useContracts } from 'web/hooks/use-contract-supabase'
import { useLinkPreviews } from 'web/hooks/use-link-previews'
import { DashboardNewsItem } from '../news/dashboard-news-item'
import { FeedContractCard } from '../contract/feed-contract-card'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { ReactNode } from 'react'
import { XCircleIcon } from '@heroicons/react/solid'
import { DashboardItem, DashboardQuestionItem } from 'common/dashboard'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { partition } from 'lodash'

export const DashboardContent = (props: {
  items: DashboardItem[]
  setItems?: (items: DashboardItem[]) => void
  isEditing?: boolean
}) => {
  const { items, isEditing, setItems } = props

  const [questions, links] = partition(
    items,
    (x): x is DashboardQuestionItem => x.type === 'question'
  )

  const slugs = questions.map((q) => q.slug)
  const contracts = useContracts(slugs, 'slug')

  const urls = links.map((l) => l.url)
  const previews = useLinkPreviews(urls)
  const isLoading =
    (slugs.length > 0 && contracts.length === 0) ||
    (urls.length > 0 && previews.length === 0)

  const renderCard = (
    card: { url: string } | { slug: string } | { content: any }
  ) => {
    if ('url' in card) {
      const preview = previews.find((p) => p.url === card.url)
      if (!preview) return null
      return (
        <DashboardNewsItem {...preview} className="shadow-md" key={card.url} />
      )
    }

    if ('slug' in card) {
      const contract = contracts.find((c) => c.slug === card.slug)
      if (!contract) return null
      return <FeedContractCard key={contract.id} contract={contract} />
    }
  }

  const onDragEnd = (result: any) => {
    const { destination, source } = result
    if (!destination) return
    const newItems = [...items]
    const [removed] = newItems.splice(source.index, 1)
    newItems.splice(destination.index, 0, removed)
    setItems?.(newItems)
  }

  if (isLoading) return <LoadingIndicator />

  return (
    <DragDropContext
      onDragStart={() => window.navigator.vibrate?.(100)}
      onDragEnd={onDragEnd}
    >
      <Droppable droppableId="dashboard">
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="flex flex-col"
          >
            {items.map((item, index) => (
              <Draggable
                isDragDisabled={!isEditing}
                key={item.type === 'link' ? item.url : item.slug}
                draggableId={item.type === 'link' ? item.url : item.slug}
                index={index}
              >
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className="mb-4"
                  >
                    <DashboardContentFrame
                      isEditing={isEditing}
                      onRemove={() => {
                        const newItems = [...items]
                        newItems.splice(index, 1)
                        setItems?.(newItems)
                      }}
                    >
                      {renderCard(item)}
                    </DashboardContentFrame>
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  )
}

function DashboardContentFrame(props: {
  children: ReactNode
  onRemove: () => void
  isEditing?: boolean
}) {
  const { children, isEditing, onRemove } = props
  if (!isEditing) {
    return <>{children}</>
  }
  return (
    <div className="relative">
      <button
        className="text-ink-500 hover:text-ink-700 absolute -top-2 right-0 z-50 transition-colors"
        onClick={onRemove}
      >
        <XCircleIcon className="h-5 w-5" />
      </button>
      <div className="pointer-events-none">{children}</div>
    </div>
  )
}
