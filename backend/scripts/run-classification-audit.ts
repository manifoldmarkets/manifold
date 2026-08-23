import { runScript } from 'run-script'
import { updateClassificationAudit } from 'scheduler/jobs/update-classification-audit'

// Run the nightly classification audit on demand.
//
// The job is read-only — it re-verifies published classifications against
// HuggingFace and OpenRouter and logs disagreements; it never writes a
// verdict. So this is safe to run against prod whenever someone wants the
// current answer rather than waiting for 03:40 LA.

if (require.main === module) {
  runScript(async () => {
    await updateClassificationAudit()
  })
}
