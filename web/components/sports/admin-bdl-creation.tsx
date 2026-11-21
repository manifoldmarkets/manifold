import { FormEvent, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import {
  MAJOR_LEAGUES,
  MAX_SPORTS_CREATION_AMOUNT,
  MAX_CREATION_GAME_KEYS,
  MAJOR_WAVES,
  MajorCreationResult,
  MajorCreationDecision,
  MajorLeague,
  MajorSettingRow,
  isMajorLeague,
} from 'common/bdl/major-leagues'
import { SPORTS_CALENDAR } from 'common/sports-calendar'
import { formatSportsPrice } from 'common/sports-price'
import { Button } from 'web/components/buttons/button'
import { Input } from 'web/components/widgets/input'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { useAdmin } from 'web/hooks/use-admin'
import { useIsAuthorized, useUser } from 'web/hooks/use-user'
import { api, APIError } from 'web/lib/api/api'

const selectClass =
  'bg-canvas-0 border-ink-300 min-h-[40px] max-w-full rounded border px-2'
const shared = ['wave:1', 'wave:2', 'wave:3', 'global'] as const
const scopes = [...MAJOR_LEAGUES, ...shared]
type Scope = (typeof scopes)[number]
const label = (key: Scope) =>
  isMajorLeague(key)
    ? key.toUpperCase() + ' daily ante'
    : key === 'global'
    ? 'Global open ante'
    : 'Wave ' + key.slice(5) + ' monthly ante'

function BudgetForm({
  scope,
  row,
  onSaved,
}: {
  scope: Scope
  row?: MajorSettingRow
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const cap = Number(data.get('cap'))
    const ante = Number(data.get('baseAnte'))
    if (
      !Number.isSafeInteger(cap) ||
      cap < 0 ||
      cap > MAX_SPORTS_CREATION_AMOUNT ||
      (isMajorLeague(scope) &&
        (!Number.isSafeInteger(ante) ||
          ante <= 0 ||
          ante > MAX_SPORTS_CREATION_AMOUNT))
    ) {
      toast.error('Enter a valid whole-mana budget.')
      return
    }
    setSaving(true)
    try {
      await api(
        'admin-sports-set-creation-budget',
        isMajorLeague(scope)
          ? {
              league: scope,
              expected: row ?? null,
              cap,
              baseAnte: ante,
              startsOn: String(data.get('startsOn')),
              groupSlugs: String(data.get('groups'))
                .split(',')
                .map((v) => v.trim())
                .filter(Boolean),
            }
          : { scope, cap, expected: row ?? null }
      )
      onSaved()
      toast.success('Budget saved')
    } catch (err) {
      if (err instanceof APIError && err.code === 409) onSaved()
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }
  return (
    <form
      onSubmit={save}
      className="grid min-w-0 grid-cols-1 items-end gap-3 sm:grid-cols-2"
    >
      <label htmlFor="sports-creation-cap">
        Cap (Ṁ)
        <Input
          id="sports-creation-cap"
          className="w-full min-w-0"
          name="cap"
          type="number"
          min={0}
          max={MAX_SPORTS_CREATION_AMOUNT}
          step="1"
          defaultValue={row?.cap ?? ''}
          required
        />
      </label>
      {isMajorLeague(scope) && (
        <>
          <label htmlFor="sports-creation-ante">
            Starting ante (Ṁ)
            <Input
              id="sports-creation-ante"
              className="w-full min-w-0"
              name="baseAnte"
              type="number"
              min={1}
              max={MAX_SPORTS_CREATION_AMOUNT}
              step="1"
              defaultValue={row?.baseAnte ?? ''}
              required
            />
          </label>
          <label htmlFor="sports-creation-start">
            Starts on (Eastern time)
            <Input
              id="sports-creation-start"
              className="w-full min-w-0"
              name="startsOn"
              type="date"
              defaultValue={row?.startsOn ?? ''}
              required
            />
          </label>
          <label htmlFor="sports-creation-topics">
            Topic slugs, comma-separated
            <Input
              id="sports-creation-topics"
              className="w-full min-w-0"
              name="groups"
              defaultValue={row?.groupSlugs?.join(', ') ?? ''}
              required
            />
          </label>
        </>
      )}
      <Button
        size="sm"
        color="gray-outline"
        className="justify-self-start"
        type="submit"
        disabled={saving}
      >
        Save budget
      </Button>
    </form>
  )
}

type Selection = {
  league: MajorLeague
  competitionId: string
  keys: string[]
  force: boolean
  maxAntes: Record<string, number>
}

type Operation = {
  selection: Selection
  pending: boolean
  result?: MajorCreationResult
  error?: string
}

function DecisionDetails({ row }: { row: MajorCreationDecision }) {
  return (
    <>
      {' · '}
      {row.status}
      {row.reason && ' · ' + row.reason}
      {row.line && ' · ' + row.line.source}
      {row.answerLabels?.length === row.line?.probs.length &&
        row.answerLabels?.map((name, index) => (
          <span key={index}>
            {' '}
            · {name} {formatSportsPrice(row.line!.probs[index])}
          </span>
        ))}
      {row.ante != null && <> · Ṁ{row.ante}</>}
    </>
  )
}

function RunCreation({
  league,
  creating,
  onCreate,
}: {
  league: MajorLeague
  creating: boolean
  onCreate: (selection: Selection) => Promise<void>
}) {
  const competitions = Array.from(
    new Map(
      SPORTS_CALENDAR.filter(
        (p) => p.provider === 'bdl' && p.bdlLeagueKey === league
      ).map((p) => [p.competitionId, p.competition])
    )
  )
  const [id, setId] = useState(competitions[0]?.[0] ?? '')
  const [force, setForce] = useState(false)
  const [gameKeys, setGameKeys] = useState('')
  const [result, setResult] = useState<MajorCreationResult>()
  const [chosen, setChosen] = useState<string[]>([])
  const [previewing, setPreviewing] = useState(false)
  const busy = previewing || creating
  const requested = Array.from(
    new Set(gameKeys.split(/[\s,]+/).filter(Boolean))
  )
  function reset() {
    setChosen([])
    setResult(undefined)
  }
  async function run(dryRun: boolean) {
    if (!id || busy || (!dryRun && !chosen.length)) return
    if (!dryRun) {
      if (!result) return
      const maxAntes = Object.fromEntries(
        result.log.flatMap((r) =>
          r.eventId && chosen.includes(r.eventId) && r.ante != null
            ? [[r.eventId, r.ante]]
            : []
        )
      )
      reset()
      await onCreate({
        league,
        competitionId: id,
        keys: chosen,
        force,
        maxAntes,
      })
      return
    }
    setPreviewing(true)
    try {
      const report = await api('admin-sports-create-bdl-markets', {
        league,
        competitionId: id,
        dryRun: true,
        force,
        ...(requested.length && { keys: requested }),
      })
      setResult(report)
      setChosen(
        report.log.flatMap((r) =>
          r.status === 'dry-run' &&
          r.eventId &&
          r.ante != null &&
          Number.isSafeInteger(r.ante) &&
          r.ante >= 0
            ? [r.eventId]
            : []
        )
      )
    } catch (err) {
      reset()
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setPreviewing(false)
    }
  }
  if (!competitions.length)
    return <p>No configured competitions for this league.</p>
  return (
    <div className="border-ink-200 flex min-w-0 flex-col items-start gap-3 border-t pt-4">
      <h3 className="text-ink-900 font-semibold">Create game markets</h3>
      <label className="grid min-w-0 max-w-full gap-1">
        Competition{' '}
        <select
          className={selectClass}
          aria-label="Competition"
          value={id}
          disabled={busy}
          onChange={(e) => {
            setId(e.target.value)
            reset()
          }}
        >
          {competitions.map(([k, n]) => (
            <option key={k} value={k}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={force}
          disabled={busy}
          onChange={(e) => {
            setForce(e.target.checked)
            reset()
          }}
        />{' '}
        Force a retry for specific games, including recreation after N/A
      </label>
      <label htmlFor="sports-creation-keys">
        {force
          ? 'Game IDs, comma-separated'
          : 'Game IDs, comma-separated (optional)'}
        <Input
          id="sports-creation-keys"
          value={gameKeys}
          disabled={busy}
          placeholder={'bdl:' + league + ':123'}
          onChange={(e) => {
            setGameKeys(e.target.value)
            reset()
          }}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={
            busy ||
            (force && !requested.length) ||
            requested.length > MAX_CREATION_GAME_KEYS
          }
          onClick={() => run(true)}
        >
          Preview markets
        </Button>
        {result?.wouldCreate ? (
          <Button
            size="sm"
            disabled={busy || !chosen.length}
            onClick={() => run(false)}
          >
            Create selected ({chosen.length})
          </Button>
        ) : null}
      </div>
      {result && (
        <div aria-live="polite" className="w-full min-w-0 text-sm">
          <p>
            {result.wouldCreate} eligible · {result.skipped} skipped ·{' '}
            {result.errors} errors
          </p>
          {result.log.length === 0 ? (
            <p>No eligible games in this window.</p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {result.log.map((row, i) => (
                <li
                  key={row.eventId ? row.eventId + '-' + i : i}
                  className="break-words"
                >
                  {row.status === 'dry-run' &&
                  row.eventId &&
                  row.ante != null ? (
                    <label>
                      <input
                        type="checkbox"
                        disabled={busy}
                        checked={chosen.includes(row.eventId)}
                        onChange={(e) => {
                          const k = row.eventId
                          if (k)
                            setChosen((prev) =>
                              e.target.checked
                                ? [...prev, k]
                                : prev.filter((v) => v !== k)
                            )
                        }}
                      />{' '}
                      {row.question ?? row.eventId}
                      <DecisionDetails row={row} />
                    </label>
                  ) : (
                    <>
                      <strong>
                        {row.question ?? row.eventId ?? league.toUpperCase()}
                      </strong>
                      <DecisionDetails row={row} />
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export function AdminBdlCreation() {
  const user = useUser()
  const admin = useAdmin()
  const authorized = useIsAuthorized()
  return user && admin && authorized ? (
    <OperatorWorkspace key={user.id} />
  ) : null
}

function OperatorWorkspace() {
  const [last, setLast] = useState<Operation>()
  const pending = useRef(false)
  async function submit(selection: Selection) {
    if (pending.current) return
    pending.current = true
    setLast({ selection, pending: true })
    try {
      const result = await api('admin-sports-create-bdl-markets', {
        ...selection,
        dryRun: false,
      })
      setLast({ selection, pending: false, result })
    } catch (err) {
      setLast({
        selection,
        pending: false,
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      pending.current = false
    }
  }
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <CreationPanel creating={last?.pending ?? false} onCreate={submit} />
      {last && (
        <div
          aria-live="polite"
          className="border-ink-200 border-t pt-3 text-sm"
        >
          <h3 className="font-semibold">
            Creation receipt · {last.selection.league.toUpperCase()}
          </h3>
          {last.pending && (
            <p>Creating {last.selection.keys.length} selected games…</p>
          )}
          {last.error && (
            <p>
              Could not confirm the outcome for {last.selection.keys.join(', ')}
              . Check the markets before retrying. {last.error}
            </p>
          )}
          {last.result && (
            <>
              <p>
                {last.result.created} created · {last.result.skipped} skipped ·{' '}
                {last.result.errors} errors
              </p>
              <ul className="max-h-80 overflow-y-auto">
                {last.result.log.map((r, i) => (
                  <li key={i} className="break-words">
                    {r.question ??
                      r.eventId ??
                      last.selection.league.toUpperCase()}
                    <DecisionDetails row={r} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function CreationPanel({
  creating,
  onCreate,
}: {
  creating: boolean
  onCreate: (selection: Selection) => Promise<void>
}) {
  const [rows, setRows] = useState<MajorSettingRow[]>()
  const [unavailable, setUnavailable] = useState(false)
  const [revision, setRevision] = useState(0)
  const [scope, setScope] = useState<Scope>('nba')
  const status = useAPIGetter('admin-sports-bdl-competitions', {})
  useEffect(() => {
    const controller = new AbortController()
    setUnavailable(false)
    api(
      'admin-sports-creation-settings',
      {},
      { cache: 'no-store', signal: controller.signal }
    ).then(
      (data) => {
        if (!controller.signal.aborted) setRows(data.settings)
      },
      () => {
        if (!controller.signal.aborted) {
          setRows(undefined)
          setUnavailable(true)
        }
      }
    )
    return () => controller.abort()
  }, [revision])
  if (unavailable)
    return (
      <div role="status" className="flex flex-wrap items-center gap-2">
        <p>
          Creation settings are unavailable. Check the sports API and its
          migration.
        </p>
        <Button
          size="sm"
          color="gray-outline"
          onClick={() => setRevision((v) => v + 1)}
        >
          Retry settings
        </Button>
      </div>
    )
  if (!rows) return <p role="status">Loading creation settings…</p>
  const row = rows.find((r) => r.scope === scope)
  const info = status.data?.leagues.find((r) => r.league === scope)
  return (
    <div className="flex min-w-0 flex-col gap-4 text-sm">
      <label className="text-ink-700 grid max-w-max gap-1">
        Budget{' '}
        <select
          className={selectClass}
          aria-label="Budget"
          value={scope}
          onChange={(e) => {
            const opt = scopes.find((v) => v === e.target.value)
            if (opt) setScope(opt)
          }}
        >
          {scopes.map((k) => (
            <option key={k} value={k}>
              {label(k)}
            </option>
          ))}
        </select>
      </label>
      <p className="text-ink-600">
        {isMajorLeague(scope)
          ? 'The daily cap limits this league’s starting antes per UTC day.'
          : scope === 'global'
          ? 'The global cap limits outstanding starting antes across all leagues.'
          : 'The wave cap limits starting antes across its leagues per UTC month.'}
      </p>
      <BudgetForm
        key={JSON.stringify([scope, row])}
        scope={scope}
        row={row}
        onSaved={() => setRevision((v) => v + 1)}
      />
      {isMajorLeague(scope) && (
        <>
          <p className="text-ink-600">
            Wave {MAJOR_WAVES[scope]} · Open Odds API markets:{' '}
            {info?.openOdds ?? 'Unknown'} · Closed awaiting resolution:{' '}
            {info?.closedOdds ?? 'Unknown'}
          </p>
          <RunCreation
            key={scope + '-' + revision}
            league={scope}
            creating={creating}
            onCreate={onCreate}
          />
        </>
      )}
    </div>
  )
}
