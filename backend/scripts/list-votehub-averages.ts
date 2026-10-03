import { log } from 'shared/utils'
import {
  ALL_VOTEHUB_FEED_SPECS,
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
// ALL_VOTEHUB_FEED_SPECS: the answer keys of the latest day of its published
// series (what `answerKey` must match), and the `answers[].choice` strings of
// the most recent raw poll (what `pollAnswerChoice` must match). Run it
// before backfilling any spec whose comment says its key and shape were not
// verified against a live response, and fix the constant if it disagrees.
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
      log(`--- ${spec.feedId} (averageKey=${spec.averageKey})`)
      try {
        const series = await fetchVoteHubAverage(spec)
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
        log.error(`  averages fetch failed: ${err}`)
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
