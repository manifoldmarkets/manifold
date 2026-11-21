import { useState } from 'react'
import {
  BDL_LEAGUES,
  BDL_LEAGUE_KEYS,
  BdlLeagueKey,
  isBdlLeagueKey,
} from 'common/bdl/leagues'
import {
  LIVE_INTERVALS,
  pollingTarget,
  ScorePollingPanel,
} from 'common/sports-score-polling'
import { useAPIGetter } from 'web/hooks/use-api-getter'

type Props = {
  leagues: ScorePollingPanel['leagues']
  pending: Record<string, number | null>
  save: (target: string, seconds: number | null) => Promise<void>
}

const timestamp = (value: string | null | undefined) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString()
    : 'Unknown'

export function AdminBdlPolling({ leagues, pending, save }: Props) {
  const [key, setKey] = useState<BdlLeagueKey>('nba')
  const { data, error, refresh, loading } = useAPIGetter(
    'admin-sports-bdl-competitions',
    {}
  )
  const summary = data?.leagues?.find((row) => row.league === key)
  const setting = leagues?.find((row) => row.leagueKey === key)
  const target = pollingTarget.league(key)
  const busy = target in pending
  const value = busy ? pending[target] ?? 0 : setting?.intervalSeconds ?? 0
  return (
    <section
      aria-label="BALLDONTLIE operations"
      className="@container border-ink-200 min-w-0 space-y-3 rounded-lg border p-3 text-sm"
    >
      <h3 className="text-ink-900 font-semibold">BALLDONTLIE operations</h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-ink-700 grid min-w-0 gap-1">
          BDL league
          <select
            className="bg-canvas-0 border-ink-300 min-h-[40px] max-w-full rounded border px-2"
            aria-label="BDL league"
            value={key}
            onChange={(e) => {
              if (isBdlLeagueKey(e.target.value)) setKey(e.target.value)
            }}
          >
            {BDL_LEAGUE_KEYS.map((k) => (
              <option key={k} value={k}>
                {BDL_LEAGUES[k].label}
              </option>
            ))}
          </select>
        </label>
        {setting && (
          <label className="text-ink-700 grid gap-1">
            BDL live score interval
            <select
              className="bg-canvas-0 border-ink-300 min-h-[40px] rounded border px-2"
              aria-label="BDL live score interval"
              value={value}
              disabled={busy}
              onChange={(e) => void save(target, Number(e.target.value))}
            >
              {LIVE_INTERVALS.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds === 0
                    ? 'Off'
                    : seconds < 60
                    ? seconds + ' s'
                    : seconds / 60 + ' min'}
                </option>
              ))}
            </select>
          </label>
        )}
        {setting && !setting.isDefault && (
          <button
            type="button"
            className="text-primary-700 min-h-[40px] underline"
            disabled={busy}
            onClick={() => void save(target, null)}
          >
            Reset league to off
          </button>
        )}
      </div>
      {setting ? (
        <p className="text-ink-600 text-xs">
          The default is off. A game override takes precedence over its league.
        </p>
      ) : (
        <p className="text-ink-600">BDL polling controls unavailable.</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-ink-800 font-medium">League status</h4>
        <button
          type="button"
          className="text-primary-700 min-h-[40px] underline"
          disabled={loading}
          onClick={() => void refresh()}
        >
          Refresh status
        </button>
      </div>
      {error && (
        <p className="text-ink-700" role="status">
          Could not refresh league status.
        </p>
      )}
      {summary ? (
        <>
          <dl className="text-ink-700 @[30rem]:grid-cols-3 grid gap-2">
            <div>
              <dt>Odds markets open for trading</dt>
              <dd className="font-semibold">{summary.openOdds ?? 'Unknown'}</dd>
            </div>
            <div>
              <dt>Closed Odds markets awaiting resolution</dt>
              <dd className="font-semibold">
                {summary.closedOdds ?? 'Unknown'}
              </dd>
            </div>
            <div>
              <dt>Vendor freshness</dt>
              <dd>Unknown</dd>
            </div>
            <div>
              <dt>Recorder status</dt>
              <dd>Unknown</dd>
            </div>
          </dl>
          <h4 className="text-ink-800 font-medium">Competition phases</h4>
          {summary.phases?.length ? (
            <ul className="space-y-2">
              {summary.phases.map((phase) => (
                <li
                  key={
                    phase.provider +
                    '/' +
                    phase.competitionId +
                    '/' +
                    phase.phase
                  }
                  className="text-ink-700"
                >
                  <span className="font-medium">
                    {phase.competition} · {phase.phase}
                  </span>
                  <span className="block text-xs">
                    {phase.provider === 'odds' ? 'Odds API' : 'BDL'} ·{' '}
                    {phase.on ? 'On' : 'Off'} (default{' '}
                    {phase.defaultOn ? 'on' : 'off'}) · {phase.startDate} –{' '}
                    {phase.endDate}
                  </span>
                  {phase.locked && (
                    <span className="block text-xs">
                      Locked · {phase.locked}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-600">
              {summary.phases
                ? 'No configured phases.'
                : 'Phase status unavailable.'}
            </p>
          )}
          <h4 className="text-ink-800 font-medium">HTTP requests</h4>
          {summary.requests?.length ? (
            <ul className="divide-ink-200 divide-y">
              {summary.requests.map((row) => (
                <li
                  key={row.role + '/' + row.endpoint}
                  className="text-ink-700 space-y-1 py-2 text-xs"
                >
                  <div className="break-all font-semibold">
                    {row.endpoint} · {row.role}
                  </div>
                  <div>
                    Successful {row.successes ?? 'Unknown'} · HTTP 401{' '}
                    {row.unauthorized ?? 'Unknown'} · HTTP 429{' '}
                    {row.throttled ?? 'Unknown'} · Other{' '}
                    {row.other ?? 'Unknown'}
                  </div>
                  <div>
                    Last request {timestamp(row.lastRequest)} · HTTP{' '}
                    {row.status ?? 'Unknown'}
                  </div>
                  <div>
                    Last successful HTTP response {timestamp(row.lastSuccess)}
                  </div>
                  <div>
                    Quota remaining {row.remaining ?? 'Unknown'} · Limit{' '}
                    {row.limit ?? 'Unknown'}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-600">
              {summary.requests
                ? 'No requests recorded.'
                : 'Request history unavailable.'}
            </p>
          )}
        </>
      ) : (
        <p className="text-ink-600">
          {loading ? 'Loading league status…' : 'League status unavailable.'}
        </p>
      )}
    </section>
  )
}
