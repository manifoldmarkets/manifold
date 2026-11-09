import { describeOracleFeedLifecycle, getOracleFeed } from 'shared/oracle-feeds'
import { log } from 'shared/utils'
import {
  ALL_VOTEHUB_FEED_SPECS,
  VoteHubHttpError,
  fetchVoteHubAverage,
  fetchVoteHubAverageList,
  fetchVoteHubPolls,
} from 'shared/votehub-feeds'
import { runScript } from './run-script'

// Discovery helper for the VoteHub feed specs — read-only, writes nothing.
//
//   npx ts-node list-votehub-averages.ts
//
// Prints VoteHub's `GET /averages` list verbatim, then for every spec in
// ALL_VOTEHUB_FEED_SPECS: its registry lifecycle, the answer keys of the
// latest day of its published series (what `answerKey` must match), and the
// `answers[].choice` strings of the most recent raw poll (what
// `pollAnswerChoice` must match). Run it before backfilling any spec whose
// comment says its key and shape were not verified against a live response,
// and fix the constant if it disagrees.
//
// For a spec registered as AWAITING ITS SOURCE (the 2028 generic-ballot pair)
// a 404 on its averages is the expected state — VoteHub has not published the
// key yet — and a fetch that SUCCEEDS is the signal to promote it (see the
// pending entry in launch-manifest.ts for the steps). Any other failure
// (5xx, timeout, bad JSON) is reported as an error for every spec alike.
if (require.main === module)
  runScript(async () => {
    // Guarded like the per-spec fetches below: a failing list endpoint must
    // not hide the per-spec diagnostics, which are the part that matters.
    try {
      log('GET /averages:')
      log(JSON.stringify(await fetchVoteHubAverageList(), null, 2))
    } catch (err) {
      log.error(`GET /averages failed: ${err}`)
    }

    for (const spec of ALL_VOTEHUB_FEED_SPECS) {
      const lifecycle = getOracleFeed(spec.feedId)?.lifecycle
      log(
        `--- ${spec.feedId} (averageKey=${spec.averageKey}, answerKey=${
          spec.answerKey
        }${spec.seriesEndsOn ? `, series ends ${spec.seriesEndsOn}` : ''}) — ${
          lifecycle ? describeOracleFeedLifecycle(lifecycle) : 'live'
        }`
      )
      try {
        const series = await fetchVoteHubAverage(spec)
        if (lifecycle?.phase === 'awaiting-source')
          log(
            `  SOURCE NOW PUBLISHED for ${spec.feedId}: verify the keys below, then promote it (clear the registry lifecycle)`
          )
        const days = Object.keys(series ?? {})
          .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
          .sort()
        const latest = days[days.length - 1]
        log(
          `  ${days.length} days, latest ${latest ?? 'n/a'}: ${JSON.stringify(
            latest ? series[latest] : null
          )} (spec answerKey=${spec.answerKey})`
        )
      } catch (err) {
        if (
          lifecycle?.phase === 'awaiting-source' &&
          err instanceof VoteHubHttpError &&
          err.status === 404
        )
          log(
            `  still unpublished by VoteHub (expected while awaiting): ${err.message}`
          )
        else log.error(`  averages fetch failed: ${err}`)
      }
      try {
        const since = new Date(Date.now() - 60 * 86_400_000)
          .toISOString()
          .slice(0, 10)
        const polls = await fetchVoteHubPolls(spec, since)
        const newest = polls[0]
        log(
          `  ${polls.length} polls since ${since}; newest ${
            newest?.end_date ?? 'n/a'
          } ${newest?.pollster ?? ''}: choices ${JSON.stringify(
            newest?.answers?.map((a) => a.choice) ?? []
          )} (spec pollAnswerChoice=${spec.pollAnswerChoice})`
        )
      } catch (err) {
        log.error(`  polls fetch failed: ${err}`)
      }
    }
  })
