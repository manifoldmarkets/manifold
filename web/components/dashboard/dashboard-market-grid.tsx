import clsx from 'clsx'
import { Extension, JSONContent } from '@tiptap/core'
import { useEffect, useRef, useState } from 'react'
import { Contract } from 'common/contract'
import { SortKey, sortContracts } from 'web/lib/sort-contracts'
import { DashboardMarketCard } from 'web/components/dashboard/dashboard-market-card'
import { ContractRow } from 'web/components/contract/contracts-table'
import {
  traderColumn,
  liquidityColumn,
  probColumn,
} from 'web/components/contract/contract-table-col-formats'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { SelectMarkets } from 'web/components/contract-select-modal'
import { Content, TextEditor, useTextEditor } from 'web/components/widgets/editor'
import { JSONEmpty } from 'web/components/contract/contract-description'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/outline'
import { XCircleIcon } from '@heroicons/react/solid'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import type { DropResult } from '@hello-pangea/dnd'

// ─── Constants ────────────────────────────────────────────────────────────────

const RESOLVED_COLLAPSE_COUNT = 3
const DESCRIPTION_MAX = 280
const resolvedColumns = [traderColumn, liquidityColumn, probColumn]

// ─── Dashboard Market Grid ────────────────────────────────────────────────────

/**
 * Self-contained dashboard grid with sort, edit mode, add/remove markets,
 * drag-and-drop reordering, polls section, resolved section, and description.
 *
 * Props:
 *   initialContracts  — markets to display on load
 *   initialSlugOrder  — optional explicit ordering; defaults to initialContracts order
 *   canEdit           — shows edit controls (done/edit, add market, polls section, drag handles)
 *                       For Community tab: pass isAdminOrMod
 *                       For general dashboards: pass isAdminOrMod || user.id === dashboard.creatorId
 *   creatorUsername   — if provided, renders "dashboard by @username" attribution
 *   trackingLocation  — analytics tracking string passed to market cards
 */
export function DashboardMarketGrid({
  initialContracts,
  initialSlugOrder,
  canEdit,
  creatorUsername,
  trackingLocation = 'dashboard',
}: {
  initialContracts: Contract[]
  initialSlugOrder?: string[]
  canEdit: boolean
  creatorUsername?: string
  trackingLocation?: string
}) {
  const [contracts, setContracts] = useState<Contract[]>(initialContracts)
  const [slugOrder, setSlugOrder] = useState<string[]>(
    initialSlugOrder ?? initialContracts.map((c) => c.slug)
  )
  const [sort, setSort] = useState<SortKey>('newest')
  const [defaultSort, setDefaultSort] = useState<SortKey>('newest')
  const [editMode, setEditMode] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [showAddPoll, setShowAddPoll] = useState(false)
  const [showPollsSection, setShowPollsSection] = useState(false)
  const [pollsExpanded, setPollsExpanded] = useState(false)
  const [resolvedExpanded, setResolvedExpanded] = useState(false)
  const [descriptionContent, setDescriptionContent] = useState<JSONContent | undefined>(undefined)

  const maxLinesExtension = Extension.create({
    name: 'maxLines',
    addKeyboardShortcuts() {
      const blockIfAtMax = ({ editor }: { editor: any }) => {
        let lineCount = 0
        editor.state.doc.forEach((node: any) => {
          if (node.type.name === 'paragraph') {
            lineCount++
            node.forEach((child: any) => {
              if (child.type.name === 'hardBreak') lineCount++
            })
          }
        })
        return lineCount >= 3
      }
      return { Enter: blockIfAtMax, 'Shift-Enter': blockIfAtMax }
    },
  })

  const descEditor = useTextEditor({
    size: 'sm',
    max: DESCRIPTION_MAX,
    placeholder: 'Add a description…',
    defaultValue: descriptionContent,
    extensions: [maxLinesExtension],
  })

  const charCount = descEditor?.storage?.characterCount?.characters?.() ?? 0

  useEffect(() => {
    if (!descEditor || !editMode) return
    setDescriptionContent(descEditor.getJSON())
  }, [descEditor?.state.doc.textContent, editMode])

  function handleAdd(contract: Contract) {
    if (contracts.find((c) => c.id === contract.id)) return
    setContracts((prev) => [...prev, contract])
    setSlugOrder((prev) => [...prev, contract.slug])
  }

  function handleRemove(contract: Contract) {
    setContracts((prev) => prev.filter((c) => c.id !== contract.id))
    setSlugOrder((prev) => prev.filter((s) => s !== contract.slug))
  }

  function onDragEnd(result: DropResult) {
    if (!result.destination) return
    const newOrder = [...slugOrder]
    const [removed] = newOrder.splice(result.source.index, 1)
    newOrder.splice(result.destination.index, 0, removed)
    setSlugOrder(newOrder)
  }

  const polls = contracts.filter((c) => c.outcomeType === 'POLL' && !c.resolution)
  const activeRaw = contracts.filter(
    (c) => !c.resolution && !(showPollsSection && c.outcomeType === 'POLL')
  )
  const active = sortContracts(activeRaw, slugOrder, sort)
  const resolved = contracts
    .filter((c) => !!c.resolution)
    .sort((a, b) => (b.resolutionTime ?? 0) - (a.resolutionTime ?? 0))
  const visibleResolved = resolvedExpanded ? resolved : resolved.slice(0, RESOLVED_COLLAPSE_COUNT)
  const hiddenCount = resolved.length - RESOLVED_COLLAPSE_COUNT
  const sortOptions: { key: SortKey; label: string }[] = [
    { key: 'date', label: 'Close date' },
    { key: 'volume', label: 'Volume' },
    { key: 'title', label: 'Title' },
    { key: 'newest', label: 'Newest' },
    { key: 'oldest', label: 'Oldest' },
    ...(canEdit ? [{ key: 'manual' as SortKey, label: 'Manual' }] : []),
  ]

  return (
    <Col className="gap-0">
      {/* Creator attribution + description */}
      <Col className="mb-3 gap-0">
        {creatorUsername && (
          <p className="text-ink-400 mt-0.5 text-xs">
            dashboard by{' '}
            <a href={`/${creatorUsername}`} className="hover:text-ink-600 transition-colors">
              @{creatorUsername}
            </a>
          </p>
        )}
        {editMode ? (
          <Col className="gap-1">
            <div className="max-h-[5em] overflow-y-auto">
              <TextEditor editor={descEditor} simple hideToolbar />
            </div>
            <span className="text-ink-400 self-end text-xs">{charCount}/{DESCRIPTION_MAX}</span>
          </Col>
        ) : descriptionContent && !JSONEmpty(descriptionContent) ? (
          <Content content={descriptionContent} size="sm" className="line-clamp-3 text-ink-600" />
        ) : (
          <div className="mt-1 h-[1.625em]" />
        )}
      </Col>

      <Col className="gap-3">
        {/* Controls row */}
        <Row className="flex-wrap items-center justify-between gap-3">
          <Row className="items-center gap-3">
            <div className="relative inline-block">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="bg-canvas-50 border-ink-300 text-ink-700 hover:bg-canvas-100 cursor-pointer appearance-none rounded-full border py-1.5 pl-3.5 pr-8 text-sm font-medium transition-colors focus:outline-none"
              >
                {sortOptions.map(({ key, label }) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <ChevronDownIcon className="text-ink-500 pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
            </div>
            {sort !== defaultSort && (
              <button
                onClick={() => setDefaultSort(sort)}
                className="text-primary-500 hover:text-primary-600 text-xs underline-offset-2 hover:underline"
              >
                Set default
              </button>
            )}
          </Row>

          {canEdit && (
            <Row className="items-center gap-2">
              <button
                onClick={() => setEditMode((v) => !v)}
                className="border-ink-200 text-ink-500 hover:bg-canvas-50 rounded border px-2 py-0.5 text-xs transition-colors"
              >
                {editMode ? 'done' : 'edit'}
              </button>
              {editMode && (
                <>
                  <button
                    onClick={() => setShowPollsSection((v) => !v)}
                    className="border-ink-300 text-ink-600 hover:bg-canvas-50 rounded border px-2 py-0.5 text-xs font-medium transition-colors"
                  >
                    {showPollsSection ? 'Hide polls section' : '+ Polls section'}
                  </button>
                  <button
                    onClick={() => setShowAdd(true)}
                    className="bg-indigo-600 hover:bg-indigo-700 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors"
                  >
                    + Add market
                  </button>
                </>
              )}
            </Row>
          )}
        </Row>

        {/* Polls section */}
        {showPollsSection && (
          <Col className="border-ink-200 rounded-xl border">
            <Row className="border-ink-200 items-center justify-between border-b px-4 py-3">
              <span className="text-ink-500 text-sm font-medium">Polls ({polls.length})</span>
              <Row className="items-center gap-2">
                {editMode && (
                  <button
                    onClick={() => setShowAddPoll(true)}
                    className="text-indigo-500 hover:text-indigo-700 text-xs font-medium transition-colors"
                  >
                    + Add poll
                  </button>
                )}
                <button
                  onClick={() => setPollsExpanded((e) => !e)}
                  className="text-ink-400 hover:text-ink-600 transition-colors"
                >
                  {pollsExpanded
                    ? <ChevronUpIcon className="h-4 w-4" />
                    : <ChevronDownIcon className="h-4 w-4" />
                  }
                </button>
              </Row>
            </Row>
            {pollsExpanded && (
              polls.length > 0 ? (
                <Col className="divide-ink-100 divide-y">
                  {polls.map((contract) => (
                    <div key={contract.id} className="px-4">
                      <ContractRow contract={contract} columns={resolvedColumns} />
                    </div>
                  ))}
                </Col>
              ) : (
                <p className="text-ink-400 px-4 py-3 text-sm">
                  No polls yet.{editMode && ' Click + Add poll to add one.'}
                </p>
              )
            )}
          </Col>
        )}

        {/* Active markets grid */}
        {sort === 'manual' && editMode ? (
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="dashboard">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                >
                  {active.map((contract, index) => (
                    <Draggable key={contract.id} draggableId={contract.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={clsx(
                            'relative flex flex-col',
                            snapshot.isDragging && 'opacity-80 shadow-lg'
                          )}
                        >
                          <div
                            {...provided.dragHandleProps}
                            className="absolute top-2 left-2 z-10 flex cursor-grab items-center rounded bg-ink-200/80 px-1.5 py-1 text-ink-600 hover:bg-ink-300 select-none"
                            title="Drag to reorder"
                          >
                            <span className="text-[15px] leading-none">⠿</span>
                          </div>
                          <button
                            onClick={() => handleRemove(contract)}
                            className="text-ink-400 hover:text-ink-600 absolute -top-2 -right-2 z-10 transition-colors"
                          >
                            <XCircleIcon className="h-5 w-5" />
                          </button>
                          <DashboardMarketCard contract={contract} trackingLocation={trackingLocation} />
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {active.map((contract) => (
              <div key={contract.id} className="relative flex flex-col">
                {editMode && (
                  <button
                    onClick={() => handleRemove(contract)}
                    className="text-ink-400 hover:text-ink-600 absolute -top-2 -right-2 z-10 transition-colors"
                  >
                    <XCircleIcon className="h-5 w-5" />
                  </button>
                )}
                <DashboardMarketCard contract={contract} trackingLocation={trackingLocation} />
              </div>
            ))}
          </div>
        )}

        {/* Resolved section */}
        {resolved.length > 0 && (
          <Col className="border-ink-200 mt-6 rounded-xl border">
            <div className="border-ink-200 border-b px-4 py-3">
              <span className="text-ink-500 text-sm font-medium">Resolved ({resolved.length})</span>
            </div>
            <Col className="divide-ink-100 divide-y">
              {visibleResolved.map((contract) => (
                <div key={contract.id} className="px-4">
                  <ContractRow contract={contract} columns={resolvedColumns} />
                </div>
              ))}
            </Col>
            {resolved.length > RESOLVED_COLLAPSE_COUNT && (
              <button
                onClick={() => setResolvedExpanded((e) => !e)}
                className="border-ink-200 text-ink-500 hover:text-ink-700 hover:bg-canvas-100 flex w-full items-center justify-center gap-1 border-t py-2.5 text-sm transition-colors"
              >
                {resolvedExpanded ? (
                  <><ChevronUpIcon className="h-4 w-4" /> Show less</>
                ) : (
                  <><ChevronDownIcon className="h-4 w-4" /> Show {hiddenCount} more</>
                )}
              </button>
            )}
          </Col>
        )}
      </Col>

      {showAdd && (
        <Modal open setOpen={(o) => { if (!o) setShowAdd(false) }} size="md">
          <Col className={clsx(MODAL_CLASS, 'gap-3')}>
            <p className="text-ink-1000 text-base font-semibold">Add market to dashboard</p>
            <SelectMarkets
              submitLabel={(len) => `Add ${len} market${len !== 1 ? 's' : ''}`}
              onSubmit={(selected) => {
                selected.forEach(handleAdd)
                setShowAdd(false)
              }}
            />
          </Col>
        </Modal>
      )}
      {showAddPoll && (
        <Modal open setOpen={(o) => { if (!o) setShowAddPoll(false) }} size="md">
          <Col className={clsx(MODAL_CLASS, 'gap-3')}>
            <p className="text-ink-1000 text-base font-semibold">Add poll to dashboard</p>
            <SelectMarkets
              submitLabel={(len) => `Add ${len} poll${len !== 1 ? 's' : ''}`}
              onSubmit={(selected) => {
                selected.forEach(handleAdd)
                setShowAddPoll(false)
              }}
            />
          </Col>
        </Modal>
      )}
    </Col>
  )
}
