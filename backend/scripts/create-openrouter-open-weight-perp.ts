import { createPerp } from 'api/create-perp'
import { OPENROUTER_OPEN_WEIGHT_FEED_ID } from 'common/perps/open-weight-models'
import { HOUR_MS } from 'common/util/time'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// One-shot: stand up the open-weight-vs-closed AI perp on the OpenRouter
// token-share feed.
//
// Run with NEXT_PUBLIC_FIREBASE_ENV=DEV — common's ENV_CONFIG defaults to
// PROD without it, so admin-gated handlers (createPerp) reject the dev admin
// ids even though runScript connects to the dev database.

const DEV_MANIFOLD = 'MxyCh2xvsFMFywwjg3Az0w4xP5B3'
const AI_GROUP = 'a88aa165-a517-4f8a-8e04-c9ca71581943'
const TECH_GROUP = 'eTLPaK6lRxfzvMtGwUY3'

// f_max is per PERIOD. This feed's updatePeriodMs is HOUR_MS, so the derived
// funding period is hourly and the annual ceiling of 100%/yr divides by 8760.
const MAX_FUNDING_RATE_HOURLY = 1 / 8760

const DESCRIPTION = `**Is open-source AI winning?** This market tracks the share of tokens on OpenRouter's 50 most-used models that are served by models whose **weights the public can download** — DeepSeek, Qwen, Llama, GLM, Kimi, gpt-oss and friends — versus closed, API-only models like GPT, Claude, Gemini and Grok.

The price is that percentage. It has run from about 24% in late 2025 to the low 70s now. Higher means open weights are taking share.

**This is a proxy, and you should know exactly which one.** It measures traffic routed through OpenRouter — largely developer and hobbyist usage — **not global AI usage**. Enterprise deployments, first-party apps like ChatGPT and Claude, and self-hosted models are not in it. You can be right about open models winning in the world and still lose this market.

**How the number is computed**

- Trailing **7 UTC days**, recomputed **hourly**. OpenRouter publishes whole days, so the value normally steps once a day as a new day lands, damped by the 7-day window.
- **Top 50 models only.** OpenRouter bundles everything else into a single unlabelled \`other\` row. It cannot be classified, so it is **excluded from the denominator** rather than estimated.
- A model that is not yet classified is excluded from **both** sides until it is — never defaulted to open or closed.
- The test is **downloadability**, not licence purity: public weights count even under a non-OSI licence (Llama, Gemma). Research-only or private access does not. Weights released after launch are reclassified **from the release date forward, never retroactively**.
- Backfilled history before launch is classified with the current list; reconstructing contemporaneous judgements is not possible.

The full classification list — every model, and for open ones a link to the weights repo that is the evidence — is rendered on this page, along with OpenRouter's attribution and the data's \`as of\` timestamp.

Source: OpenRouter (openrouter.ai/rankings).`

if (require.main === module)
  runScript(async ({ pg }) => {
    const latest = await pg.one(
      `select ts, price from oracle_prices where feed_id = $1
       order by ts desc limit 1`,
      [OPENROUTER_OPEN_WEIGHT_FEED_ID]
    )
    const count = await pg.one(
      `select count(*) as n from oracle_prices where feed_id = $1`,
      [OPENROUTER_OPEN_WEIGHT_FEED_ID]
    )
    log(
      `feed has ${count.n} points; latest ${Number(latest.price).toFixed(
        3
      )}% at ${latest.ts}`
    )
    if (Number(count.n) < 300)
      throw new Error(
        'backfill looks missing — run backfill-openrouter-oracle first'
      )

    const created = await createPerp(
      {
        question: 'Open vs Closed AI: open-weight share of OpenRouter tokens',
        descriptionMarkdown: DESCRIPTION,
        visibility: 'public',
        groupIds: [AI_GROUP, TECH_GROUP],
        oracleFeedId: OPENROUTER_OPEN_WEIGHT_FEED_ID,
        maxLeverage: 100,
        maxFundingRate: MAX_FUNDING_RATE_HOURLY,
        fundingSensitivity: 1,
        // 6h, comfortably above the feed's 3h staleAfterMs (create-perp
        // rejects anything tighter), so a couple of missed hourly runs don't
        // freeze trading on a value that only genuinely moves once a day.
        maxOraclePriceAgeMs: 6 * HOUR_MS,
        subsidyLong: 5000,
        subsidyShort: 5000,
      } as any,
      { uid: DEV_MANIFOLD } as any,
      {} as any
    )
    const market = 'result' in created ? (created as any).result : created
    log(`created ${market.id} — ${market.url ?? market.slug}`)

    // The funding period must have been derived from the feed registry as
    // hourly. Daily here would reintroduce the dodge (see the registry entry).
    const check = await pg.one(
      `select data->>'fundingPeriodMs' as period,
              data->>'maxFundingRate' as fmax,
              data->>'oraclePrice' as price
       from contracts where id = $1`,
      [market.id]
    )
    if (Number(check.period) !== HOUR_MS)
      throw new Error(
        `fundingPeriodMs is ${check.period}, expected ${HOUR_MS} — create path did not derive the hourly period`
      )
    log(
      `verified: fundingPeriodMs=${check.period} (hourly), ` +
        `maxFundingRate=${check.fmax}, entry oraclePrice=${check.price}`
    )
  })
