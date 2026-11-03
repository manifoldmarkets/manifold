import clsx from 'clsx'
import { useRef, useState } from 'react'

import { formatPercent } from 'common/util/format'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Modal, MODAL_CLASS } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { api } from 'web/lib/api/api'
import {
  optionFor,
  resolveCall,
  ResolveUnit,
} from 'web/lib/politics/election-resolve-model'

export type RunResult = { status: 'ok' } | { status: 'error'; message: string }

// Review the selection, then resolve it one market at a time. Each unit's
// outcome was fixed when it was ticked; this dialog only shows how the
// market prices that outcome now.
export function ElectionResolveConfirm(props: {
  open: boolean
  setOpen: (open: boolean) => void
  units: ResolveUnit[]
  choices: Record<string, string>
  onFinished: (results: Record<string, RunResult>) => void
}) {
  const { open, setOpen, units, choices, onFinished } = props
  const [acknowledged, setAcknowledged] = useState(false)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<Record<string, RunResult>>({})
  const stop = useRef(false)

  const close = () => {
    if (running) return
    setAcknowledged(false)
    setProgress({})
    setOpen(false)
  }

  const runAll = async () => {
    setRunning(true)
    stop.current = false
    const out: Record<string, RunResult> = {}
    // Fixed at the start, so units leaving the selection as they resolve
    // (or a refresh) cannot reorder or skip the run.
    const queue = units.map((u) => ({ unit: u, value: choices[u.key] }))
    for (const { unit, value } of queue) {
      if (stop.current) break
      try {
        await api('market/:contractId/resolve', resolveCall(unit, value))
        out[unit.key] = { status: 'ok' }
      } catch (e) {
        out[unit.key] = {
          status: 'error',
          message: e instanceof Error ? e.message : String(e),
        }
      }
      setProgress({ ...out })
    }
    setRunning(false)
    onFinished(out)
  }

  const done = Object.keys(progress).length
  const failed = Object.values(progress).filter((r) => r.status === 'error')
  const finished = !running && done > 0
  const against = units.filter((u) => choices[u.key] !== u.leader.value)

  return (
    <Modal open={open} setOpen={close} size="lg">
      <Col className={clsx(MODAL_CLASS, '!items-stretch')}>
        <div className="text-lg font-semibold">
          Resolve {units.length} {units.length === 1 ? 'market' : 'markets'}
        </div>
        {against.length > 0 && (
          <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {against.length} of these resolve against the current market leader.
            Check them before you continue.
          </div>
        )}
        <div className="border-ink-200 max-h-[50vh] overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <tbody>
              {units.map((u) => {
                const value = choices[u.key]
                const option = optionFor(u, value)
                const r = progress[u.key]
                const isAgainst = value !== u.leader.value
                return (
                  <tr key={u.key} className="border-ink-100 border-t">
                    <td className="whitespace-nowrap px-3 py-2 font-semibold">
                      {u.race}
                    </td>
                    <td className="px-3 py-2">
                      <div className="line-clamp-1">{u.question}</div>
                      {u.answerText && (
                        <div className="text-ink-600 text-xs">
                          Answer: {u.answerText}
                        </div>
                      )}
                    </td>
                    <td
                      className={clsx(
                        'whitespace-nowrap px-3 py-2 font-semibold',
                        isAgainst && 'text-amber-700'
                      )}
                    >
                      {option?.label ?? value}
                      <span className="text-ink-500 ml-1 font-normal">
                        {option ? formatPercent(option.prob) : ''}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">
                      {!r ? (
                        ''
                      ) : r.status === 'ok' ? (
                        <span className="text-teal-700">Resolved</span>
                      ) : (
                        <span className="text-scarlet-600">{r.message}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {finished ? (
          <Row className="items-center justify-between gap-3">
            <span className="text-sm">
              {done - failed.length} resolved
              {failed.length ? `, ${failed.length} failed (see above)` : ''}
              {done < units.length ? `, ${units.length - done} not run` : ''}.
            </span>
            <Button color="gray-outline" onClick={close}>
              Close
            </Button>
          </Row>
        ) : (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="border-ink-300 text-primary-600 h-4 w-4 rounded"
                checked={acknowledged}
                disabled={running}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              Every race above has been called, and each outcome is right.
            </label>
            <Row className="items-center justify-end gap-3">
              {running ? (
                <>
                  <span className="text-ink-600 text-sm">
                    Resolving {done + 1} of {units.length}…
                  </span>
                  <Button
                    color="gray-outline"
                    onClick={() => (stop.current = true)}
                  >
                    Stop after this one
                  </Button>
                </>
              ) : (
                <>
                  <Button color="gray-outline" onClick={close}>
                    Cancel
                  </Button>
                  <Button
                    color="red"
                    disabled={!acknowledged || !units.length}
                    onClick={runAll}
                  >
                    Resolve {units.length}
                  </Button>
                </>
              )}
            </Row>
          </>
        )}
      </Col>
    </Modal>
  )
}
