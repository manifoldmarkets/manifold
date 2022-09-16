import clsx from 'clsx'
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd'
import { MenuIcon } from '@heroicons/react/solid'

import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Subtitle } from 'web/components/subtitle'
import { keyBy } from 'lodash'

export function ArrangeHome(props: {
  sections: { label: string; id: string }[]
  setSectionIds: (sections: string[]) => void
}) {
  const { sections, setSectionIds } = props

  const sectionsById = keyBy(sections, 'id')

  return (
    <DragDropContext
      onDragEnd={(e) => {
        const { destination, source, draggableId } = e
        if (!destination) return

        const section = sectionsById[draggableId]

        const newSectionIds = sections.map((section) => section.id)

        newSectionIds.splice(source.index, 1)
        newSectionIds.splice(destination.index, 0, section.id)

        setSectionIds(newSectionIds)
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
