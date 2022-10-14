import clsx from 'clsx'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { MenuIcon } from '@heroicons/react/solid'
import { toast } from 'react-hot-toast'
import { XCircleIcon } from '@heroicons/react/outline'

import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Subtitle } from 'web/components/widgets/subtitle'
import { keyBy } from 'lodash'
import { Button } from './buttons/button'
import { updateUser } from 'web/lib/firebase/users'
import { leaveGroup } from 'web/lib/firebase/groups'
import { User } from 'common/user'
import { useUser } from 'web/hooks/use-user'
import { Group } from 'common/group'

export function ArrangeHome(props: {
  sections: { label: string; id: string; group?: Group }[]
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
  items: { id: string; label: string; group?: Group }[]
}) {
  const user = useUser()
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
                    user={user}
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
  item: { id: string; label: string; group?: Group }
  user: User | null | undefined
  className?: string
}) => {
  const { item, user, className } = props
  const { group } = item

  return (
    <Row
      className={clsx(
        className,
        'items-center justify-between gap-4 rounded bg-gray-50 p-2'
      )}
    >
      <Row className="items-center gap-4">
        <MenuIcon
          className="h-5 w-5 flex-shrink-0 text-gray-500"
          aria-hidden="true"
        />{' '}
        {item.label}
      </Row>

      {group && (
        <Button
          className="pt-1 pb-1"
          color="gray-white"
          onClick={() => {
            if (user) {
              const homeSections = (user.homeSections ?? []).filter(
                (id) => id !== group.id
              )
              updateUser(user.id, { homeSections })

              toast.promise(leaveGroup(group, user.id), {
                loading: 'Unfollowing group...',
                success: `Unfollowed ${group.name}`,
                error: "Couldn't unfollow group, try again?",
              })
            }
          }}
        >
          <XCircleIcon
            className={clsx('h-5 w-5 flex-shrink-0')}
            aria-hidden="true"
          />
        </Button>
      )}
    </Row>
  )
}
