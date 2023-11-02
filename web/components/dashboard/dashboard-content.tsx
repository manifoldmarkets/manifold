import { useContracts } from 'web/hooks/use-contract-supabase'
import {
  DashboardNewsItemPlaceholder,
  MaybeDashboardNewsItem,
} from '../news/dashboard-news-item'
import { FeedContractCard } from '../contract/feed-contract-card'
import { ReactNode, useState } from 'react'
import { XCircleIcon } from '@heroicons/react/solid'
import { DashboardItem, DashboardQuestionItem } from 'common/dashboard'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { AddItemFloatyButton } from './add-dashboard-item'
import { DashboardLive } from './dashboard-live'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { LinkPreviews } from 'common/link-preview'

export const DashboardContent = (props: {
  items: DashboardItem[]
  previews?: LinkPreviews
  setItems?: (items: DashboardItem[]) => void
  topics: string[]
  setTopics?: (topics: string[]) => void
  isEditing?: boolean
}) => {
  const { items, previews, isEditing, setItems, topics = [], setTopics } = props

  const questions = items.filter(
    (x): x is DashboardQuestionItem => x.type === 'question'
  )

  const slugs = questions.map((q) => q.slug)
  const contracts = useContracts(slugs, 'slug')

  const [loadLiveFeed, setLoadLiveFeed] = useState(false)
  const { ref: loadLiveRef } = useIsVisible(() => setLoadLiveFeed(true), true)

  const renderCard = (
    card: { url: string } | { slug: string } | { content: any }
  ) => {
    if ('url' in card) {
      const preview = previews?.[card.url]
      return <MaybeDashboardNewsItem url={card.url} preview={preview} />
    }

    if ('slug' in card) {
      const contract = contracts.find((c) => c.slug === card.slug)
      if (!contract) return <DashboardNewsItemPlaceholder pulse />
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

  const [hoverIndex, setHoverIndex] = useState<number>()
  const [hoverTop, setHoverTop] = useState<number>()

  return (
    <>
      <div ref={loadLiveRef} />
      <DragDropContext
        onDragStart={() => window.navigator.vibrate?.(100)}
        onDragEnd={onDragEnd}
      >
        <Droppable droppableId="dashboard">
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="relative flex flex-col"
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
                      className="relative mb-4"
                      onMouseMove={(e) => {
                        if (
                          e.nativeEvent.offsetY <
                          e.currentTarget.offsetHeight / 2
                        ) {
                          setHoverIndex(index)
                          setHoverTop(e.currentTarget.offsetTop - 8)
                        } else {
                          setHoverIndex(index + 1)
                          setHoverTop(
                            e.currentTarget.offsetTop +
                              e.currentTarget.offsetHeight +
                              4
                          )
                        }
                      }}
                    >
                      <div {...provided.dragHandleProps}>
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
                    </div>
                  )}
                </Draggable>
              ))}
              {isEditing &&
                !snapshot.isDraggingOver &&
                hoverIndex != null &&
                hoverTop != null && (
                  <div
                    className="absolute -right-2 hidden -translate-y-1/2 translate-x-full transition-all md:block lg:-right-8"
                    style={{ top: hoverTop }}
                  >
                    <AddItemFloatyButton
                      key="floaty button"
                      position={hoverIndex}
                      items={items}
                      setItems={setItems}
                      topics={topics}
                      setTopics={setTopics}
                    />
                  </div>
                )}

              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
      {loadLiveFeed && <DashboardLive topics={topics} editing={isEditing} />}
    </>
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
      <div className="pointer-events-none">{children}</div>
      <button
        className="text-ink-500 hover:text-ink-700 absolute -top-2 right-0  transition-colors"
        onClick={onRemove}
      >
        <XCircleIcon className="h-5 w-5" />
      </button>
    </div>
  )
}
