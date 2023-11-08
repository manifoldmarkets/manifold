import { useContracts } from 'web/hooks/use-contract-supabase'
import {
  DashboardNewsItemPlaceholder,
  MaybeDashboardNewsItem,
} from '../news/dashboard-news-item'
import { FeedContractCard } from '../contract/feed-contract-card'
import { useState } from 'react'
import { XCircleIcon } from '@heroicons/react/solid'
import { DashboardItem, DashboardQuestionItem } from 'common/dashboard'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { AddItemFloatyButton } from './add-dashboard-item'
import { DashboardLive } from './dashboard-live'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { LinkPreviews } from 'common/link-preview'
import { DashboardText } from './dashboard-text-card'
import { Contract } from 'common/contract'
import clsx from 'clsx'

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

  const [hoverIndex, setHoverIndex] = useState<number>()
  const [hoverTop, setHoverTop] = useState<number>()

  return (
    <>
      <div ref={loadLiveRef} />
      <DragDropContext
        onDragStart={() => window.navigator.vibrate?.(100)}
        onDragEnd={({ destination, source }) => {
          if (!destination) return
          const newItems = [...items]
          const [removed] = newItems.splice(source.index, 1)
          newItems.splice(destination.index, 0, removed)
          setItems?.(newItems)
        }}
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
                  key={key(item)}
                  draggableId={key(item)}
                  index={index}
                >
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
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
                      <Card
                        item={item}
                        setItem={(newItem) => {
                          const newItems = [...items]
                          newItems[index] = newItem

                          setItems?.(newItems)
                        }}
                        previews={previews}
                        contracts={contracts}
                        isEditing={isEditing}
                      />
                      {isEditing && (
                        <RemoveButton
                          onClick={() => {
                            const newItems = [...items]
                            newItems.splice(index, 1)
                            setItems?.(newItems)
                          }}
                        />
                      )}
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

const key = (item: DashboardItem) => {
  if (item.type === 'link') return item.url
  if (item.type === 'question') return item.slug
  return item.id
}

const Card = (props: {
  item: DashboardItem
  setItem: (item: DashboardItem) => void
  previews?: LinkPreviews
  contracts: Contract[]
  isEditing?: boolean
}) => {
  const { item, setItem, previews, contracts, isEditing } = props
  if (item.type === 'link') {
    const preview = previews?.[item.url]

    return (
      <MaybeDashboardNewsItem
        url={item.url}
        preview={preview}
        className={clsx(isEditing && 'pointer-events-none')}
      />
    )
  }

  if (item.type === 'question') {
    const contract = contracts.find((c) => c.slug === item.slug)
    if (!contract) return <DashboardNewsItemPlaceholder pulse />
    return <FeedContractCard key={contract.id} contract={contract} />
  }

  if (item.type === 'text') {
    return (
      <DashboardText
        content={item.content}
        editing={isEditing}
        onSave={(content) => setItem({ ...item, content })}
      />
    )
  }

  // should be never
  return item
}

function RemoveButton(props: { onClick: () => void }) {
  return (
    <button
      className="text-ink-500 hover:text-ink-700 absolute -top-2 right-0  transition-colors"
      onClick={props.onClick}
    >
      <XCircleIcon className="h-5 w-5" />
    </button>
  )
}
