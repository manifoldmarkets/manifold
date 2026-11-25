import { sum, uniqBy, xor } from 'lodash'
import { useEffect, useRef, useState } from 'react'
import {
  AdminMajorCreationResult,
  MajorLeague,
  StoredMajorSettingRow,
  MAX_CREATION_GAME_KEYS,
  isMajorLeague,
} from 'common/bdl/major-leagues'
import {
  confirmedCreationSelection,
  CreationRow,
  creationPreviewRequest,
  CreationScope,
} from 'common/bdl/major-creation-selection'
import { SPORTS_CALENDAR } from 'common/sports-calendar'
import { Button } from 'web/components/buttons/button'
import { Input } from 'web/components/widgets/input'
import { Select } from 'web/components/widgets/select'
import { useIsAuthorized } from 'web/hooks/use-user'
import { useQuery } from 'web/hooks/use-query'
import { api } from 'web/lib/api/api'
import {
  budgetLabel,
  BudgetForm,
  BudgetScope,
  scopes,
} from './admin-bdl-budgets'

const eastern = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  dateStyle: 'medium',
  timeStyle: 'long',
})
type Selection = NonNullable<ReturnType<typeof confirmedCreationSelection>>
type Receipt = {
  selection: Selection
  pending: boolean
  result?: AdminMajorCreationResult
  error?: string
}
function describe(row: CreationRow) {
  const names = row.answerLabels?.join(' at ') || row.question
  const time = row.confirmation?.startTime
  const predecessors = row.confirmation?.canceledContractIds
  return [
    names,
    time && Number.isFinite(new Date(time).getTime())
      ? eastern.format(time)
      : undefined,
    row.ante != null && 'Ṁ' + row.ante.toLocaleString(),
    row.reason,
    row.contractId && 'Market ID ' + row.contractId,
    predecessors?.length && 'Replaces ' + predecessors.join(', '),
  ]
    .filter(Boolean)
    .join(' · ')
}
function selector(
  label: string,
  value: string,
  options: [string, string][],
  change: (s: string) => void,
  disabled = false
) {
  return (
    <label className="grid w-fit max-w-full gap-1">
      {label}
      <Select
        className="min-w-0 max-w-full"
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => change(e.target.value)}
      >
        {options.map(([id, name]) => (
          <option value={id} key={id}>
            {name}
          </option>
        ))}
      </Select>
    </label>
  )
}
type GameProps = {
  league: MajorLeague
  submitting: boolean
  onCreate: (s: Selection) => void
}
function GameCreation({ league, submitting, onCreate }: GameProps) {
  const competitions = uniqBy(
    SPORTS_CALENDAR.filter(
      (p) => p.provider === 'bdl' && p.bdlLeagueKey === league
    ),
    'competitionId'
  )
  const [competitionId, setCompetition] = useState(
    competitions[0]?.competitionId ?? ''
  )
  const [force, setForce] = useState(false)
  const [keys, setKeys] = useState('')
  const [preview, setPreview] = useState<CreationScope>()
  const generation = useRef(0)
  const requested = Array.from(new Set(keys.split(/[\s,]+/).filter(Boolean)))
  const request = { league, competitionId, force, keys: requested }
  const valid = creationPreviewRequest(request)
  return (
    <section
      aria-label="Create game markets"
      className="border-ink-200 grid min-w-0 gap-3 border-t pt-4"
    >
      <h3 className="font-semibold">Create game markets</h3>
      <fieldset
        disabled={submitting}
        className="grid min-w-0 gap-3"
        onChange={() => setPreview(undefined)}
      >
        {selector(
          'Competition',
          competitionId,
          competitions.map((c) => [c.competitionId, c.competition]),
          setCompetition
        )}
        <label>
          <input
            type="checkbox"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
          />{' '}
          Replace canceled markets (Force)
        </label>
        <label>
          Game IDs{force ? ' (required)' : ' (optional)'}
          <Input
            className="w-full"
            placeholder={'bdl:' + league + ':123'}
            value={keys}
            onChange={(e) => setKeys(e.target.value)}
          />
        </label>
      </fieldset>
      {!valid && <p>Use up to {MAX_CREATION_GAME_KEYS} exact game IDs.</p>}
      <Button
        size="sm"
        disabled={!valid || !competitionId || submitting}
        onClick={() => {
          generation.current++
          setPreview(request)
        }}
      >
        Preview markets
      </Button>
      {preview && (
        <Preview
          key={generation.current}
          request={preview}
          submit={(selection) => {
            setPreview(undefined)
            onCreate(selection)
          }}
        />
      )}
    </section>
  )
}
function Preview({
  request,
  submit,
}: {
  request: CreationScope
  submit?: (s: Selection) => void
}) {
  const [chosen, setChosen] = useState<string[]>([])
  const { data: result, error } = useQuery(() =>
    api('admin-sports-create-bdl-markets', creationPreviewRequest(request)!)
  )
  const waiting = error
    ? 'Preview unavailable. Run a fresh preview.'
    : 'Loading preview…'
  if (!result) return <p role="status">{waiting}</p>
  const selection = confirmedCreationSelection(result.log, request, chosen)
  const maximum = sum(Object.values(selection?.maxAntes ?? {}))
  return (
    <>
      <p role="status">
        {result.log.length
          ? submit
            ? 'Select eligible games.'
            : 'Current market status'
          : 'No games in this preview.'}
      </p>
      <ul className="grid min-w-0 gap-2">
        {result.log.map((row, i) => {
          const id = row.eventId
          const eligible =
            submit &&
            id &&
            confirmedCreationSelection(result.log, request, [id])
          const reason =
            submit && !eligible && row.status === 'dry-run'
              ? 'Confirmation unavailable'
              : row.status
          const text = [describe(row), id, reason].filter(Boolean).join(' · ')
          if (!id || !eligible) return <li key={i}>{text}</li>
          const toggle = () => setChosen((prev) => xor(prev, [id]))
          return (
            <li key={id} className="break-words">
              <label>
                <input
                  type="checkbox"
                  checked={chosen.includes(id)}
                  onChange={toggle}
                />{' '}
                {text}
              </label>
            </li>
          )
        })}
      </ul>
      {submit && (
        <Button
          size="sm"
          disabled={!selection}
          onClick={() => selection && submit(selection)}
        >
          Create selected ({chosen.length})
          {selection && ' · Ṁ' + maximum.toLocaleString() + ' maximum'}
        </Button>
      )}
    </>
  )
}

export function AdminBdlCreation() {
  return useIsAuthorized() ? <OperatorControls /> : null
}
function OperatorControls() {
  const [scope, setScope] = useState<BudgetScope>('nba')
  const [revision, setRevision] = useState(0),
    [notice, setNotice] = useState('')
  const [dirty, setDirty] = useState(false),
    [saving, setSaving] = useState(false)
  const [rows, setRows] = useState<
    StoredMajorSettingRow[] | 'loading' | 'error'
  >('loading')
  useEffect(() => {
    const c = new AbortController()
    const options = { cache: 'no-store' as const, signal: c.signal }
    const accept = (value: typeof rows) => {
      if (!c.signal.aborted) setRows(value)
    }
    api('admin-sports-creation-settings', {}, options).then(
      (r) => accept(r.settings),
      () => accept('error')
    )
    return () => c.abort()
  }, [revision])
  function reload() {
    setRows('loading')
    setDirty(false)
    setRevision((n) => n + 1)
  }
  const [receipt, setReceipt] = useState<Receipt>()
  const [checking, setChecking] = useState(false)
  const pending = useRef(false)
  async function submit(selection: Selection) {
    if (pending.current) return
    pending.current = true
    setChecking(false)
    setReceipt({ selection, pending: true })
    try {
      const result = await api('admin-sports-create-bdl-markets', selection)
      setReceipt({ selection, pending: false, result })
    } catch (err) {
      setReceipt({
        selection,
        pending: false,
        error: err instanceof Error ? err.message : 'Request failed.',
      })
    } finally {
      pending.current = false
    }
  }
  function changeScope(value: string) {
    setScope(scopes.find((s) => s === value) ?? scope)
    setNotice('')
    setDirty(false)
  }
  return (
    <div className="grid min-w-0 gap-4 text-sm">
      <div role="status">{notice}</div>
      {rows === 'loading' ? (
        <p role="status">Loading creation settings…</p>
      ) : rows === 'error' ? (
        <Button onClick={reload}>
          Creation settings unavailable · Reload settings
        </Button>
      ) : (
        <>
          {selector(
            'Budget scope',
            scope,
            scopes.map((s) => [s, budgetLabel(s)]),
            changeScope,
            saving
          )}
          <BudgetForm
            key={'budget-' + scope + revision}
            {...{ scope, dirty, saving }}
            onMessage={setNotice}
            row={rows.find((r) => r.scope === scope)}
            onEdit={() => setDirty(true)}
            onSaving={setSaving}
            onReload={reload}
          />
          {isMajorLeague(scope) &&
            (dirty ? (
              <p>Save or discard budget edits before previewing games.</p>
            ) : (
              <GameCreation
                key={'games-' + scope + revision}
                league={scope}
                onCreate={submit}
                submitting={!!receipt?.pending}
              />
            ))}
        </>
      )}
      {receipt && (
        <section
          aria-label="Creation receipt"
          aria-live="polite"
          className="border-ink-200 grid gap-2 border-t pt-3"
        >
          <h3>Creation receipt · {receipt.selection.league.toUpperCase()}</h3>
          {receipt.error && (
            <p>
              Outcome unconfirmed. Check current markets before submitting
              again. {receipt.error}
            </p>
          )}
          <ul>
            {receipt.selection.keys.map((id) => {
              const matches = receipt.result?.log.filter(
                (r) => r.eventId === id
              )
              const status =
                matches?.length === 1
                  ? matches[0].status + ' · ' + describe(matches[0])
                  : receipt.pending
                  ? 'Pending'
                  : 'Unconfirmed · check existing markets'
              return (
                <li key={id} className="break-words">
                  {id} · {status}
                </li>
              )
            })}
          </ul>
          {!receipt.pending && !checking && (
            <Button onClick={() => setChecking(true)}>
              Check current markets
            </Button>
          )}
          {checking && <Preview request={receipt.selection} />}
        </section>
      )}
    </div>
  )
}
