import { runScript } from 'run-script'
import { runClassificationAudit } from 'scheduler/jobs/update-classification-audit'

// Run the nightly classification audit on demand.
//
// The job is read-only — it re-verifies published classifications against
// HuggingFace and OpenRouter and logs disagreements; it never writes a
// verdict. So this is safe to run against prod whenever someone wants the
// current answer rather than waiting for 03:40 LA.

// Calls the THROWING variant, not the scheduler's `updateClassificationAudit`
// wrapper. That wrapper swallows into `log.error` so one bad night cannot kill
// the cron — correct there, wrong here: an operator running this by hand would
// have got exit 0 and a clean-looking terminal on a run that never checked
// anything.
if (require.main === module) {
  runScript(async () => {
    const { rot, contradicted, unreachable } = await runClassificationAudit()
    if (rot.length > 0 || contradicted.length > 0 || unreachable > 0)
      console.log(
        `\nfindings: ${rot.length} rot, ${contradicted.length} contradicted, ` +
          `${unreachable} unverifiable`
      )
  })
}
