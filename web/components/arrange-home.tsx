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
  homeSections: string[]
  setHomeSections: (sections: string[]) => void
}) {
  const { user, homeSections, setHomeSections } = props

  const groups = useMemberGroups(user?.id) ?? []
  const { itemsById, sections } = getHomeItems(groups, homeSections)

  return (
    <DragDropContext
      onDragEnd={(e) => {
        const { destination, source, draggableId } = e
        if (!destination) return

        const item = itemsById[draggableId]

        const newHomeSections = sections.map((section) => section.id)

        newHomeSections.splice(source.index, 1)
        newHomeSections.splice(destination.index, 0, item.id)

        setHomeSections(newHomeSections)
      }}
    >
      <Row className="relative max-w-md gap-4">
        <DraggableList items={sections} title="Sections" />
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
      {(provided) => (
        <Col
          {...provided.droppableProps}
          ref={provided.innerRef}
          className={clsx('flex-1 items-stretch gap-1 rounded bg-gray-100 p-4')}
        >
          <Subtitle text={title} className="mx-2 !mt-0 !mb-4" />
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
                      snapshot.isDragging && 'z-[9000] bg-gray-200'
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

export const getHomeItems = (groups: Group[], sections: string[]) => {
  const items = [
    { label: 'Trending', id: 'score' },
    { label: 'New for you', id: 'newest' },
    ...groups.map((g) => ({
      label: g.name,
      id: g.id,
    })),
  ]
  const itemsById = keyBy(items, 'id')

  const sectionItems = filterDefined(sections.map((id) => itemsById[id]))

  // Add unmentioned items to the end.
  sectionItems.push(...items.filter((item) => !sectionItems.includes(item)))

  return {
    sections: sectionItems,
    itemsById,
  }
}
