import { useState } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { Modal } from 'web/components/layout/modal'
import { Page } from 'web/components/layout/page'
import { Input } from 'web/components/widgets/input'
import { Checkbox } from 'web/components/widgets/checkbox'
import { Task } from 'common/src/todo'
import { ArchiveIcon, PlusIcon, ScaleIcon } from '@heroicons/react/solid'
import clsx from 'clsx'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { api } from 'web/lib/api/api'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { Button } from 'web/components/buttons/button'
import { CirclePicker } from 'react-color'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { EditInPlaceInput } from 'web/components/widgets/edit-in-place'
import DropdownMenu from 'web/components/widgets/dropdown-menu'
import DotsVerticalIcon from '@heroicons/react/outline/DotsVerticalIcon'
import { ValidatedAPIParams } from 'common/api/schema'
import { DAY_MS } from 'common/util/time'
import { useRouter } from 'next/router'
import toast from 'react-hot-toast'

// Create audio element for the chaching sound
const chachingSound =
  typeof window !== 'undefined' ? new Audio('/sounds/droplet3.m4a') : null

export default function TodoPage() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState('')
  // Persist todos and categories in local storage
  const [tasks, setTasks] = usePersistentLocalState<Task[]>([], 'todos-4')
  const { data: categoriesData, refresh: refreshCategories } = useAPIGetter(
    'get-categories',
    {}
  )
  const categories = categoriesData?.categories ?? []
  const [newTodoText, setNewTodoText] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<number>(-1)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const router = useRouter()
  const createTodo = async (text: string) => {
    try {
      // First create remotely
      const { id } = await api('create-task', {
        text,
        categoryId: selectedCategoryId ?? -1,
        priority: 0,
      })

      // Then update locally
      const newTodo: Task = {
        id,
        text,
        completed: false,
        categoryId: selectedCategoryId,
        createdAt: Date.now(),
        priority: 0,
        archived: false,
      }
      setTasks([...tasks, newTodo])
      setNewTodoText('')
    } catch (error) {
      console.error('Failed to create todo:', error)
    }
  }

  const updateTask = async (params: ValidatedAPIParams<'update-task'>) => {
    const { id, ...updates } = params
    try {
      // First update locally
      const newTasks = tasks.map((task) =>
        task.id === id ? { ...task, ...updates } : task
      )
      setTasks(newTasks)

      // Then update remotely
      await api('update-task', params)
    } catch (error) {
      console.error('Failed to update todo:', error)
      // Revert on error
      setTasks(tasks)
    }
  }

  const addTodo = () => {
    if (!newTodoText.trim()) return
    createTodo(newTodoText)
  }

  const toggleTodo = async (taskId: number) => {
    const task = tasks.find((t) => t.id === taskId)
    if (task) {
      const newCompleted = !task.completed
      try {
        await updateTask({ id: taskId, completed: newCompleted })
        if (newCompleted) {
          // Play sound and show toast only on completion
          chachingSound?.play()
          toast.success('Task completed! 🎉', {
            duration: 2000,
          })
        }
      } catch (error) {
        console.error('Failed to toggle todo:', error)
      }
    }
  }

  const filteredTasks = (
    selectedCategoryId
      ? tasks.filter((task) => task.categoryId === selectedCategoryId)
      : tasks.filter((task) => task.categoryId === -1)
  )
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
    .filter((task) => !task.archived)

  const getSelectedCategoryTitle = () => {
    if (selectedCategoryId === -1) return 'Inbox'
    const category = categories.find((c) => c.id === selectedCategoryId)
    return category?.name ?? 'Inbox'
  }

  const filteredCategories = categories.filter((category) => !category.archived)
  const closeTime = Date.now() + DAY_MS
  const formattedCloseTime = new Date(closeTime).toLocaleString('en-US', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
  return (
    <Page trackPageView="todo">
      <DragDropContext
        onDragEnd={async (result) => {
          console.log('Drag ended:', result)
          if (!result.destination) {
            console.log('No destination')
            return
          }

          console.log(
            'Destination droppableId:',
            result.destination.droppableId
          )
          const todoId = parseInt(result.draggableId)
          let categoryId: number

          // Handle drops on different targets
          if (result.destination.droppableId === 'inbox') {
            console.log('Dropping in inbox')
            categoryId = -1
          } else if (result.destination.droppableId.startsWith('category-')) {
            console.log('Dropping in category')
            categoryId = parseInt(
              result.destination.droppableId.replace('category-', '')
            )
          } else {
            console.log('Dropping in current list')
            categoryId = selectedCategoryId
          }

          try {
            await updateTask({
              id: todoId,
              categoryId,
            })
          } catch (error) {
            console.error('Failed to update todo category:', error)
          }
        }}
      >
        <div className="flex min-h-screen overflow-x-hidden">
          {/* Main content */}
          <Col className="flex-1 gap-4 p-4">
            <h1 className="text-2xl font-bold">{getSelectedCategoryTitle()}</h1>

            <Row className="items-center gap-2">
              <Input
                type="text"
                value={newTodoText}
                onChange={(e) => setNewTodoText(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addTodo()}
                placeholder="Add a new task..."
                className="flex-1"
              />
              <button
                onClick={addTodo}
                className="bg-primary-500 hover:bg-primary-600 rounded-full p-2 text-white"
              >
                <PlusIcon className="h-5 w-5" />
              </button>
            </Row>

            <Droppable droppableId={selectedCategoryId?.toString() ?? 'inbox'}>
              {(provided, snapshot) => (
                <Col
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="gap-4"
                >
                  {filteredTasks.map((task, index) => (
                    <Draggable
                      key={task.id}
                      draggableId={task.id.toString()}
                      index={index}
                    >
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          className={clsx(
                            'max-w-full transition-shadow',
                            snapshot.isDragging && 'shadow-lg'
                          )}
                          style={{
                            ...provided.draggableProps.style,
                            width: snapshot.isDragging ? '300px' : '100%',
                          }}
                        >
                          <Row
                            className={clsx(
                              'w-full items-start justify-between',
                              task.completed && 'opacity-50',
                              task.archived && 'opacity-50'
                            )}
                          >
                            <Row className="flex-1 items-start">
                              <Checkbox
                                label=""
                                checked={task.completed}
                                toggle={() => toggleTodo(task.id)}
                              />
                              <EditInPlaceInput
                                className="w-full"
                                initialValue={task.text}
                                onSave={(text) =>
                                  updateTask({ id: task.id, text })
                                }
                              >
                                {(value) => <span>{value}</span>}
                              </EditInPlaceInput>
                            </Row>
                            <DropdownMenu
                              buttonContent={
                                <DotsVerticalIcon className="h-5 w-5" />
                              }
                              items={[
                                {
                                  icon: <ArchiveIcon className="h-4 w-4" />,
                                  name: 'Archive',
                                  onClick: async () => {
                                    updateTask({ id: task.id, archived: true })
                                  },
                                },
                                {
                                  name: 'Convert to Market',
                                  icon: <ScaleIcon className="h-4 w-4" />,
                                  onClick: () => {
                                    const params = {
                                      q: `Will I complete ${task.text} by ${formattedCloseTime}?`,
                                      closeTime,
                                      description: JSON.stringify({
                                        type: 'doc',
                                        content: [
                                          {
                                            type: 'paragraph',
                                            content: [
                                              {
                                                text: `Task id: ${task.id}. `,
                                                type: 'text',
                                              },
                                              {
                                                type: 'text',
                                                marks: [
                                                  {
                                                    type: 'link',
                                                    attrs: {
                                                      href: '/todo',
                                                      target: '_blank',
                                                      class:
                                                        'break-anywhere hover:underline hover:decoration-primary-400 hover:decoration-2 active:underline active:decoration-primary-400',
                                                    },
                                                  },
                                                ],
                                                text: 'Created from Manifold todo',
                                              },
                                            ],
                                          },
                                        ],
                                      }),
                                      outcomeType: 'BINARY',
                                      visibility: 'public',
                                    }
                                    const url = `/create?params=${encodeURIComponent(
                                      JSON.stringify(params)
                                    )}`
                                    router.push(url)
                                  },
                                },
                              ]}
                            />
                          </Row>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </Col>
              )}
            </Droppable>
          </Col>

          {/* Sidebar */}
          <div
            className={clsx(
              'bg-canvas-50 fixed right-0 top-0 h-full w-64 transform p-4 transition-transform duration-200 ease-in-out md:relative md:translate-x-0',
              isSidebarOpen ? 'translate-x-0' : 'translate-x-full'
            )}
          >
            <Row className="mb-4 items-center justify-between">
              <h2 className="text-lg font-semibold">Categories</h2>
              <button
                onClick={() => setIsModalOpen(true)}
                className="text-primary-500 hover:text-primary-600"
              >
                <PlusIcon className="h-5 w-5" />
              </button>
            </Row>
            <div className="space-y-2">
              <Droppable droppableId="inbox" type="DEFAULT">
                {(provided, snapshot) => (
                  <div
                    {...provided.droppableProps}
                    ref={provided.innerRef}
                    className="relative h-10"
                  >
                    <button
                      className={clsx(
                        'absolute inset-0 z-10 w-full rounded-lg p-2 text-left transition-colors',
                        selectedCategoryId === -1 && 'bg-primary-100',
                        snapshot.isDraggingOver && 'bg-primary-50'
                      )}
                      onClick={() => setSelectedCategoryId(-1)}
                    >
                      Inbox
                    </button>
                    <div
                      className={clsx(
                        'absolute left-0 top-0 h-full w-full',
                        !snapshot.isDraggingOver && 'hidden'
                      )}
                    >
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>

              <div className="space-y-2">
                {filteredCategories.map((category) => (
                  <Droppable
                    key={category.id}
                    droppableId={`category-${category.id}`}
                    type="DEFAULT"
                  >
                    {(provided, snapshot) => (
                      <div
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        className="h-10"
                      >
                        <button
                          className={clsx(
                            'h-10 w-full rounded-lg p-2 text-left transition-colors',
                            selectedCategoryId === category.id &&
                              'bg-primary-100',
                            snapshot.isDraggingOver && 'bg-primary-50'
                          )}
                          onClick={() => setSelectedCategoryId(category.id)}
                        >
                          <Row className="items-center gap-2">
                            {category.color && (
                              <div
                                className="h-4 w-4 rounded-full"
                                style={{ backgroundColor: category.color }}
                              />
                            )}
                            <Row className="flex-1 items-center justify-between">
                              <span>{category.name}</span>
                              <DropdownMenu
                                buttonContent={
                                  <DotsVerticalIcon className="h-5 w-5" />
                                }
                                items={[
                                  {
                                    icon: <ArchiveIcon className="h-4 w-4" />,
                                    name: 'Archive',
                                    onClick: async () => {
                                      await api('update-category', {
                                        categoryId: category.id,
                                        archived: true,
                                      })
                                      refreshCategories()
                                    },
                                  },
                                ]}
                              />
                            </Row>
                          </Row>
                        </button>
                        <div style={{ display: 'none' }}>
                          {provided.placeholder}
                        </div>
                      </div>
                    )}
                  </Droppable>
                ))}
              </div>
            </div>
          </div>

          {/* Mobile sidebar toggle */}
          <button
            className="bg-primary-500 hover:bg-primary-600 fixed bottom-4 right-4 rounded-full p-3 text-white md:hidden"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          >
            <PlusIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Add category modal */}
        <Modal open={isModalOpen} setOpen={setIsModalOpen}>
          <Col className="bg-canvas-0 gap-4 rounded-lg p-6">
            <h3 className="text-lg font-semibold">Add Category</h3>
            <Input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Category name"
            />
            <div>
              <label className="mb-2 block text-sm">Color</label>
              <CirclePicker
                color={newCategoryColor}
                onChange={(color) => setNewCategoryColor(color.hex)}
              />
            </div>
            <Row className="justify-end gap-2">
              <Button color="gray" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  try {
                    await api('create-category', {
                      name: newCategoryName,
                      color: newCategoryColor || undefined,
                    })
                    setIsModalOpen(false)
                    setNewCategoryName('')
                    setNewCategoryColor('')
                    refreshCategories()
                  } catch (error) {
                    console.error('Failed to create category:', error)
                  }
                }}
              >
                Create
              </Button>
            </Row>
          </Col>
        </Modal>
      </DragDropContext>
    </Page>
  )
}
