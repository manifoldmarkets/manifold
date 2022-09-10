import clsx from 'clsx'
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd'
import { MenuIcon } from '@heroicons/react/solid'

import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Subtitle } from 'web/components/subtitle'
import { useMemberGroups } from 'web/hooks/use-group'
import { filterDefined } from 'common/util/array'
import { keyBy } from 'lodash'
import { User } from 'common/user'
import { Group } from 'common/group'

export function ArrangeHome(props: {
  user: User | null | undefined
  homeSections: { visible: string[]; hidden: string[] }
  setHomeSections: (homeSections: {
    visible: string[]
    hidden: string[]
  }) => void
}) {
  const { user, homeSections, setHomeSections } = props

  const groups = useMemberGroups(user?.id) ?? []
  const { itemsById, visibleItems, hiddenItems } = getHomeItems(
    groups,
    homeSections
  )

  return (
    <DragDropContext
      onDragEnd={(e) => {
        const { destination, source, draggableId } = e
        if (!destination) return

        const item = itemsById[draggableId]

        const newHomeSections = {
          visible: visibleItems.map((item) => item.id),
          hidden: hiddenItems.map((item) => item.id),
        }

        const sourceSection = source.droppableId as 'visible' | 'hidden'
        newHomeSections[sourceSection].splice(source.index, 1)

        const destSection = destination.droppableId as 'visible' | 'hidden'
        newHomeSections[destSection].splice(destination.index, 0, item.id)

        setHomeSections(newHomeSections)
      }}
    >
      <Row className="relative max-w-lg gap-4">
        <DraggableList items={visibleItems} title="Visible" />
        <DraggableList items={hiddenItems} title="Hidden" />
      </Row>
    </DragDropContext>
  )
}

function DraggableList(props: {
  title: string
  items: { id: string; label: string }[]
}) {
  const { title, items } = props
  return (
    <Droppable droppableId={title.toLowerCase()}>
      {(provided, snapshot) => (
        <Col
          {...provided.droppableProps}
          ref={provided.innerRef}
          className={clsx(
            'width-[220px] flex-1 items-start rounded bg-gray-50 p-2',
            snapshot.isDraggingOver && 'bg-gray-100'
          )}
        >
          <Subtitle text={title} className="mx-2 !my-2" />
          {items.map((item, index) => (
            <Draggable key={item.id} draggableId={item.id} index={index}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.draggableProps}
                  {...provided.dragHandleProps}
                  style={provided.draggableProps.style}
                >
                  <SectionItem
                    className={clsx(
                      snapshot.isDragging && 'z-[9000] bg-gray-300'
                    )}
                    item={item}
                  />
                </div>
              )}
            </Draggable>
          ))}
          {provided.placeholder}
        </Col>
      )}
    </Droppable>
  )
}

const SectionItem = (props: {
  item: { id: string; label: string }
  className?: string
}) => {
  const { item, className } = props

  return (
    <div
      className={clsx(
        className,
        'flex flex-row items-center gap-4 rounded bg-gray-50 p-2'
      )}
    >
      <MenuIcon
        className="h-5 w-5 flex-shrink-0 text-gray-500"
        aria-hidden="true"
      />{' '}
      {item.label}
    </div>
  )
}

export const getHomeItems = (
  groups: Group[],
  homeSections: { visible: string[]; hidden: string[] }
) => {
  const items = [
    { label: 'Trending', id: 'score' },
    { label: 'New for you', id: 'newest' },
    ...groups.map((g) => ({
      label: g.name,
      id: g.id,
    })),
  ]
  const itemsById = keyBy(items, 'id')

  const { visible, hidden } = homeSections

  const [visibleItems, hiddenItems] = [
    filterDefined(visible.map((id) => itemsById[id])),
    filterDefined(hidden.map((id) => itemsById[id])),
  ]

  // Add unmentioned items to the visible list.
  visibleItems.push(
    ...items.filter(
      (item) => !visibleItems.includes(item) && !hiddenItems.includes(item)
    )
  )

  return {
    visibleItems,
    hiddenItems,
    itemsById,
  }
}
