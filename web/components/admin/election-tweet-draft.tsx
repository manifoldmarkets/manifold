import { MutableRefObject, useMemo, useState } from 'react'
import toast from 'react-hot-toast'

import { Contract } from 'common/contract'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Select } from 'web/components/widgets/select'
import { copyToClipboard } from 'web/lib/util/copy'
import {
  baselineFor,
  biggestMovers,
  buildSummary,
  calledByOffice,
  optionFor,
  ResolveUnit,
  Snapshot,
} from 'web/lib/politics/election-resolve-model'
import { MIDTERMS_2026 } from 'web/public/data/elections-data'

const WINDOWS = [10, 30, 60]

// A ready-to-post update built from the live prices: chamber control, what
// has been resolved, and the biggest moves over the window. Moves need this
// tab to have been open for the window; before that they run from page load.
export function ElectionTweetDraft(props: {
  units: ResolveUnit[]
  contractsBySlug: Record<string, Contract | undefined>
  history: MutableRefObject<Snapshot[]>
  loadedAt?: number
}) {
  const { units, contractsBySlug, history, loadedAt } = props
  const [windowMin, setWindowMin] = useState(10)
  const [edited, setEdited] = useState<string>()
  const [copiedAt, setCopiedAt] = useState<number>()

  const called = useMemo(
    () => calledByOffice(contractsBySlug),
    [contractsBySlug]
  )
  const senateId = contractsBySlug[MIDTERMS_2026.senateControl]?.id
  const houseId = contractsBySlug[MIDTERMS_2026.houseControl]?.id
  const yesOf = (id?: string) => {
    const unit = id ? units.find((u) => u.key === id) : undefined
    return unit ? optionFor(unit, 'YES')?.prob : undefined
  }

  const now = loadedAt ?? Date.now()
  const found = baselineFor(history.current, now, windowMin * 60_000)
  // The current refresh is no baseline for itself.
  const baseline = found && found.t < now ? found : undefined
  const live = buildSummary(
    {
      now,
      baseline,
      senateRep: yesOf(senateId),
      houseRep: yesOf(houseId),
      called,
      movers: biggestMovers(units, baseline, 3),
    },
    { senateControl: senateId, houseControl: houseId }
  )
  const text = edited ?? live

  const copy = () => {
    copyToClipboard(text)
    setCopiedAt(Date.now())
    toast.success('Copied')
  }

  return (
    <Col className="border-ink-200 bg-canvas-0 gap-2 rounded-lg border p-3">
      <Row className="flex-wrap items-center gap-3">
        <span className="font-semibold">Tweet draft</span>
        <label className="text-ink-600 flex items-center gap-2 text-sm">
          Moves over
          <Select
            className="!h-8 !py-0 !pl-2 !pr-8"
            value={windowMin}
            onChange={(e) => setWindowMin(Number(e.target.value))}
          >
            {WINDOWS.map((w) => (
              <option key={w} value={w}>
                {w} min
              </option>
            ))}
          </Select>
        </label>
        <span className="text-ink-500 text-xs">
          {copiedAt
            ? `Last copied ${Math.round((now - copiedAt) / 60_000)} min ago`
            : 'Updates with every price refresh'}
        </span>
      </Row>
      <textarea
        aria-label="Tweet draft"
        className="border-ink-300 bg-canvas-0 text-ink-1000 min-h-[9rem] w-full rounded-md border p-2 font-mono text-sm"
        value={text}
        onChange={(e) => setEdited(e.target.value)}
      />
      <Row className="items-center gap-3">
        <Button size="sm" color="indigo" onClick={copy}>
          Copy
        </Button>
        {edited !== undefined && (
          <Button
            size="sm"
            color="gray-outline"
            onClick={() => setEdited(undefined)}
          >
            Back to live numbers
          </Button>
        )}
        <span
          className={
            text.length > 280
              ? 'text-scarlet-600 text-xs'
              : 'text-ink-500 text-xs'
          }
        >
          {text.length} / 280
        </span>
      </Row>
    </Col>
  )
}
