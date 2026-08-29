import {
  OPEN_WEIGHT_LIST_VERSION,
  OPEN_WEIGHT_MODELS,
  basePermaslug,
  isCompositeSlug,
} from 'common/perps/open-weight-models'
import { runScript } from 'run-script'
import { verifyHuggingFaceWeights } from 'shared/huggingface'
import { upsertClassification } from 'shared/perps/model-classifications'

// Change an EXISTING classification.
//
// The admin tool can adjudicate a pending model but has no control for a
// verdict already made, and correcting one is now a routine operation rather
// than an exceptional one: a publisher shipping weights after launch is a
// pre-committed case in the methodology, and `update-classification-audit.ts`
// exists precisely to find verdicts that have gone stale. Detecting them
// nightly while having no way to act is half a loop.
//
// The admin page grows an inline control for this in the same change; this
// script stays for the case where the correction has to happen before a web
// deploy, which is exactly how it was first needed (GLM 5.3, 2026-08-29:
// classified closed on 08-20 when zai-org genuinely had no such repo, weights
// published 08-25, market showing a stale number in the meantime).
//
// Usage:
//   npx ts-node reclassify-model.ts <permaslug> open <owner/repo>
//   npx ts-node reclassify-model.ts <permaslug> closed
//   ... add --apply to write; dry run otherwise.

// Every refusal exits NON-ZERO. runScript ends in a bare `process.exit()`,
// which honours process.exitCode — without setting it a script that refused to
// do anything still exited 0 and read as success.
const fail = (message: string) => {
  console.error(message)
  process.exitCode = 1
}

const usage = () =>
  fail(
    'usage: reclassify-model.ts <permaslug> <open|closed> [owner/repo] [--apply] [--create]'
  )

if (require.main === module) {
  runScript(async ({ pg }) => {
    const FLAGS = ['--apply', '--create']
    const args = process.argv.slice(2).filter((a) => !FLAGS.includes(a))
    const apply = process.argv.includes('--apply')
    const [rawSlug, verdict, repo] = args
    if (!rawSlug || (verdict !== 'open' && verdict !== 'closed')) return usage()

    const permaslug = basePermaslug(rawSlug.trim())
    const open = verdict === 'open'

    // Same refusals the admin endpoint applies, so the two cannot disagree
    // about what is editable.
    if (isCompositeSlug(permaslug)) {
      fail(
        `${permaslug} is a router or floating alias — excluded from the index, ` +
          `so a verdict on it is ignored either way.`
      )
      return
    }
    if (OPEN_WEIGHT_MODELS[permaslug]) {
      fail(
        `${permaslug} is in the audited seed (version ${OPEN_WEIGHT_LIST_VERSION}). ` +
          `Changing it is a change to the published methodology — edit ` +
          `common/src/perps/open-weight-models.ts and bump the version.`
      )
      return
    }
    if (open && !repo) {
      fail('an open verdict needs the weights repo that proves it')
      return
    }

    const before = await pg.oneOrNone<{
      open: boolean | null
      weights: string | null
      source: string
    }>(
      `select open, weights, source from model_classifications where permaslug = $1`,
      [permaslug]
    )
    console.log(
      `current: ${
        before
          ? `open=${before.open} weights=${before.weights} source=${before.source}`
          : '(no row)'
      }`
    )

    // A permaslug with no row is almost always a typo, and the upsert would
    // happily INSERT one — reporting success while the model you meant to fix
    // stays untouched and an inert row joins the table.
    if (!before && !process.argv.includes('--create')) {
      fail(
        `no classification row for ${permaslug} — check the permaslug. ` +
          `Pass --create if you really mean to add a new row.`
      )
      return
    }

    // Verify before writing, not after. An open verdict is the only one that
    // asserts something positive about the world, and the whole reason this
    // script exists is a repo that changed state under a stored answer.
    let weightFileCount: number | null = null
    if (open) {
      const result = await verifyHuggingFaceWeights(repo)
      if (!result.confirmed) {
        fail(`refusing: ${repo} did not verify — ${result.reason}`)
        return
      }
      weightFileCount = result.evidence.weightFileCount
      console.log(
        `verified: ${repo} public, ${weightFileCount} weight files, ` +
          `gated=${result.evidence.gated}`
      )
    }

    console.log(
      `proposed: ${permaslug} -> ${open ? `open (${repo})` : 'closed'}`
    )
    if (!apply) return console.log('\nDRY RUN — pass --apply to write.')

    await upsertClassification(pg, {
      permaslug,
      open,
      weights: open ? repo : null,
      source: 'admin',
      classifiedBy: process.env.RECLASSIFY_ACTOR ?? 'reclassify-model-script',
      evidence: {
        method: 'reclassify-model.ts',
        previous: before
          ? { open: before.open, weights: before.weights }
          : null,
        ...(open ? { weightsRepo: repo, weightFileCount } : {}),
        reclassifiedAt: new Date().toISOString(),
      },
    })
    console.log(`\nwrote ${permaslug} -> ${open ? 'open' : 'closed'}`)
    console.log('takes effect on the next openrouter tick (hourly, at :20).')
  })
}
