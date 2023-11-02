import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd'
import { XIcon } from '@heroicons/react/outline'
import { PencilIcon } from '@heroicons/react/solid'
import { BaseDashboard, Dashboard } from 'common/dashboard'
import { uniq } from 'lodash'
import { useEffect, useRef, useState } from 'react'
import {
  setNewsDashboards,
  supabaseSearchDashboards,
} from 'web/lib/firebase/api'
import { Button } from '../buttons/button'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Avatar } from '../widgets/avatar'
import { Input } from '../widgets/input'
import { Subtitle } from '../widgets/subtitle'
import { Title } from '../widgets/title'
import { Tooltip } from '../widgets/tooltip'

export const EditNewsButton = (props: { defaultDashboards: Dashboard[] }) => {
  const { defaultDashboards } = props
  const [open, setOpen] = useState(false)

  return (
    <>
      <Tooltip text="Change pinned news" placement="right" noTap>
        <Button
          color="gray-white"
          size="sm"
          className="hidden sm:inline-flex"
          onClick={() => setOpen(true)}
        >
          <PencilIcon className="h-6 w-6" />
        </Button>
      </Tooltip>
      {open && (
        <EditNewsModal
          setOpen={setOpen}
          defaultDashboards={defaultDashboards}
        />
      )}
    </>
  )
}

const EditNewsModal = (props: {
  setOpen(open: boolean): void
  defaultDashboards: Dashboard[]
}) => {
  const { setOpen, defaultDashboards } = props

  const [dashboards, setDashboards] = useState(
    defaultDashboards.map((d) => ({ id: d.id, title: d.title }))
  )

  const onDragEnd = (result: any) => {
    const { destination, source } = result
    if (!destination) return
    const newDashboards = [...dashboards]
    const [removed] = newDashboards.splice(source.index, 1)
    newDashboards.splice(destination.index, 0, removed)
    setDashboards(newDashboards)
  }

  return (
    <Modal
      setOpen={setOpen}
      open
      size="sm"
      className="bg-canvas-0 rounded-lg p-4"
    >
      <Col>
        <div className="flex items-start justify-between">
          <Title>Edit News</Title>
          <Button
            onClick={() => {
              setNewsDashboards({ dashboardIds: dashboards.map((d) => d.id) })
              setOpen(false)
            }}
          >
            Save
          </Button>
        </div>
        {/* search */}
        <DashboardFinder
          onSelect={(d) => {
            setDashboards(uniq([...dashboards, { id: d.id, title: d.title }]))
          }}
          selected={dashboards.map((d) => d.id)}
        />

        <Subtitle>Order</Subtitle>
        <DragDropContext
          onDragStart={() => window.navigator.vibrate?.(100)}
          onDragEnd={onDragEnd}
        >
          <Droppable droppableId="news-order">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="relative flex flex-col gap-1"
              >
                {dashboards.map((d, i) => (
                  <Draggable key={d.id} draggableId={d.id} index={i}>
                    {(provided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className="bg-primary-100 flex justify-between rounded text-sm"
                      >
                        <div
                          className="grow px-2 py-1"
                          {...provided.dragHandleProps}
                        >
                          {d.title}
                        </div>
                        <button
                          className="text-ink-500 hover:text-ink-700 px-1 transition-colors"
                          onClick={() =>
                            setDashboards(
                              dashboards.filter((dd) => dd.id !== d.id)
                            )
                          }
                        >
                          <XIcon className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </Col>
    </Modal>
  )
}

const DashboardFinder = (props: {
  onSelect(dashboard: BaseDashboard): void
  selected: string[]
}) => {
  const { onSelect, selected } = props

  const [query, setQuery] = useState('')
  const [results, setResults] = useState([] as BaseDashboard[])

  const requestId = useRef(0)
  useEffect(() => {
    const id = ++requestId.current
    const load = async () => {
      const results = await supabaseSearchDashboards({
        term: query,
        offset: 0,
        limit: 50,
      })
      if (id === requestId.current) {
        setResults(results)
      }
    }
    load()
  }, [query])

  return (
    <div className="flex flex-col">
      <Input
        type="text"
        inputMode="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search dashboards"
      />

      <div className="mt-2 flex max-h-96 flex-col overflow-y-auto">
        {results
          .filter((d) => !selected.includes(d.id))
          .map((d) => (
            <button
              className="hover:bg-primary-200 flex items-start gap-2 rounded px-3 py-2 transition-colors"
              onClick={() => onSelect(d)}
              key={d.id}
            >
              <Avatar
                username={d.creatorUsername}
                avatarUrl={d.creatorAvatarUrl}
                size="2xs"
                className="mt-1"
              />
              <div className="text-left">{d.title}</div>
            </button>
          ))}
      </div>
    </div>
  )
}
