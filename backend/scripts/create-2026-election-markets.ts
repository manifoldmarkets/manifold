// Creates the official ManifoldPolitics market set for the 2026 midterm
// elections page: per-state Senate + Governor party markets, the House
// district market, and the conditional macro-outcome matrix.
//
// HYBRID approach: the well-traded community aggregates (Balance of Power,
// House majority, Senate control) are NOT created here — the page keeps using
// those. This script only fills the gaps where community coverage is weak.
//
// Usage:
//   1. Paste an API key for the TARGET ENV (dev or prod) into API_KEY below.
//      Dev:  copy from your dev account at dev.manifold.markets/profile
//      Prod: copy from the ManifoldPolitics account.
//   2. Review the editable config (close time, liquidity, HOUSE_DISTRICTS, and
//      especially the CONDITIONAL_* thresholds — those are judgment calls).
//   3. Run: cd backend/scripts && ts-node create-2026-election-markets.ts
//   It is idempotent: a market whose exact question already exists is skipped,
//   so you can edit and re-run safely. A state -> slug summary is printed at
//   the end for wiring into web/public/data.

import { runScript } from 'run-script'
import { getLocalEnv } from 'shared/init-admin'
import { Contract } from 'common/contract'

// Subset of the /market create payload that this script uses. The HTTP API
// validates the full schema (common/src/api/market-types.ts) server-side.
type CreateMarketParams = {
  question: string
  outcomeType: 'BINARY' | 'MULTIPLE_CHOICE'
  closeTime: number
  visibility: 'public' | 'unlisted'
  liquidityTier: number
  groupIds?: string[]
  initialProb?: number
  answers?: string[]
  addAnswersMode?: 'DISABLED' | 'ONLY_CREATOR' | 'ANYONE'
  shouldAnswersSumToOne?: boolean
  descriptionMarkdown?: string
}

// ============================ EDITABLE CONFIG ============================

// Paste an API key for the target environment before running.
const API_KEY = ''

const US_POLITICS_GROUP_ID = 'AjxQR8JMpNyDqtiqoA96'

// Day after the 2026 general election (2026-11-03), in UTC.
const CLOSE_TIME = new Date('2026-11-04T05:00:00.000Z').getTime()

// Party markets use these answers so the map's getPartyProbs colors them
// directly. Keep "Democratic Party" / "Republican Party" verbatim.
const PARTY_ANSWERS = ['Democratic Party', 'Republican Party', 'Other']

// 100 | 1_000 | 10_000 | 100_000 (ante / subsidy). 1_000 is a sensible default
// for per-state races; bump for higher-profile markets if desired.
const LIQUIDITY_TIER = 1_000

// Polite delay between creates to stay under rate limits.
const DELAY_MS = 500

// 2026 Senate: Class 2 seats + the OH and FL specials.
const SENATE_RACES: { code: string; state: string; special?: boolean }[] = [
  { code: 'AL', state: 'Alabama' },
  { code: 'AK', state: 'Alaska' },
  { code: 'AR', state: 'Arkansas' },
  { code: 'CO', state: 'Colorado' },
  { code: 'DE', state: 'Delaware' },
  { code: 'GA', state: 'Georgia' },
  { code: 'ID', state: 'Idaho' },
  { code: 'IL', state: 'Illinois' },
  { code: 'IA', state: 'Iowa' },
  { code: 'KS', state: 'Kansas' },
  { code: 'KY', state: 'Kentucky' },
  { code: 'LA', state: 'Louisiana' },
  { code: 'ME', state: 'Maine' },
  { code: 'MA', state: 'Massachusetts' },
  { code: 'MI', state: 'Michigan' },
  { code: 'MN', state: 'Minnesota' },
  { code: 'MS', state: 'Mississippi' },
  { code: 'MT', state: 'Montana' },
  { code: 'NE', state: 'Nebraska' },
  { code: 'NH', state: 'New Hampshire' },
  { code: 'NJ', state: 'New Jersey' },
  { code: 'NM', state: 'New Mexico' },
  { code: 'NC', state: 'North Carolina' },
  { code: 'OK', state: 'Oklahoma' },
  { code: 'OR', state: 'Oregon' },
  { code: 'RI', state: 'Rhode Island' },
  { code: 'SC', state: 'South Carolina' },
  { code: 'SD', state: 'South Dakota' },
  { code: 'TN', state: 'Tennessee' },
  { code: 'TX', state: 'Texas' },
  { code: 'VA', state: 'Virginia' },
  { code: 'WV', state: 'West Virginia' },
  { code: 'WY', state: 'Wyoming' },
  { code: 'OH', state: 'Ohio', special: true },
  { code: 'FL', state: 'Florida', special: true },
]

// 2026 Governors: the 36 states electing governors this cycle.
const GOVERNOR_RACES: { code: string; state: string }[] = [
  { code: 'AL', state: 'Alabama' },
  { code: 'AK', state: 'Alaska' },
  { code: 'AZ', state: 'Arizona' },
  { code: 'AR', state: 'Arkansas' },
  { code: 'CA', state: 'California' },
  { code: 'CO', state: 'Colorado' },
  { code: 'CT', state: 'Connecticut' },
  { code: 'FL', state: 'Florida' },
  { code: 'GA', state: 'Georgia' },
  { code: 'HI', state: 'Hawaii' },
  { code: 'ID', state: 'Idaho' },
  { code: 'IL', state: 'Illinois' },
  { code: 'IA', state: 'Iowa' },
  { code: 'KS', state: 'Kansas' },
  { code: 'ME', state: 'Maine' },
  { code: 'MD', state: 'Maryland' },
  { code: 'MA', state: 'Massachusetts' },
  { code: 'MI', state: 'Michigan' },
  { code: 'MN', state: 'Minnesota' },
  { code: 'NE', state: 'Nebraska' },
  { code: 'NV', state: 'Nevada' },
  { code: 'NH', state: 'New Hampshire' },
  { code: 'NM', state: 'New Mexico' },
  { code: 'NY', state: 'New York' },
  { code: 'OH', state: 'Ohio' },
  { code: 'OK', state: 'Oklahoma' },
  { code: 'OR', state: 'Oregon' },
  { code: 'PA', state: 'Pennsylvania' },
  { code: 'RI', state: 'Rhode Island' },
  { code: 'SC', state: 'South Carolina' },
  { code: 'SD', state: 'South Dakota' },
  { code: 'TN', state: 'Tennessee' },
  { code: 'TX', state: 'Texas' },
  { code: 'VT', state: 'Vermont' },
  { code: 'WI', state: 'Wisconsin' },
  { code: 'WY', state: 'Wyoming' },
]

// Starter set of competitive House districts for the district market.
// REVIEW/CURATE before running — these are 2024 toss-ups, not a 2026 forecast.
const HOUSE_DISTRICTS = [
  'AZ-01', 'AZ-06', 'CA-13', 'CA-22', 'CA-27', 'CA-41', 'CA-45', 'CO-08',
  'IA-01', 'IA-03', 'ME-02', 'MI-07', 'MI-08', 'MI-10', 'NE-02', 'NV-01',
  'NV-03', 'NY-04', 'NY-17', 'NY-19', 'OH-09', 'OR-05', 'PA-07', 'PA-08',
  'PA-10', 'TX-34', 'VA-02', 'WA-03', 'WI-03',
]

// Conditional macro-outcome matrix: each metric is asked once per control
// configuration. Markets resolve N/A (CANCEL) if their configuration doesn't
// happen. Edit the thresholds — they're deliberate, debatable choices.
const CONDITIONAL_CONFIGS = [
  { key: 'dem', label: 'Democrats control both chambers of Congress' },
  { key: 'split', label: 'Congress is split (one chamber each)' },
  { key: 'rep', label: 'Republicans control both chambers of Congress' },
]

const CONDITIONAL_METRICS = [
  { key: 'gdp', text: 'will US real GDP growth for calendar-year 2027 exceed 2.0% (BEA)?' },
  { key: 'sp500', text: 'will the S&P 500 finish 2027 above its 2026 year-end close?' },
  { key: 'rates', text: 'will the upper bound of the fed funds target be above 3.5% at the end of 2027?' },
  { key: 'spending', text: 'will federal outlays for FY2027 exceed $7.5 trillion?' },
  { key: 'immigration', text: 'will CBP southwest-border encounters in calendar-year 2027 exceed 1 million?' },
]

// ========================================================================

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

if (require.main === module) {
  runScript(async ({ pg }) => {
    if (!API_KEY) {
      throw new Error('Set API_KEY (target-env key) before running.')
    }

    const env = getLocalEnv()
    const domain =
      env === 'PROD'
        ? 'https://manifold.markets'
        : 'https://dev.manifold.markets'
    console.log(`Creating 2026 election markets on ${env} (${domain})`)

    // Idempotency: skip a market whose exact question already exists. Returns
    // the existing slug so the summary is complete on re-runs.
    const existingSlug = async (question: string): Promise<string | null> => {
      const row = await pg.oneOrNone<{ slug: string }>(
        `select slug from contracts where question = $1 limit 1`,
        [question]
      )
      return row?.slug ?? null
    }

    const create = async (params: CreateMarketParams): Promise<Contract> => {
      const res = await fetch(`${domain}/api/v0/market`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Key ${API_KEY}`,
        },
        body: JSON.stringify(params),
      })
      const json = await res.json()
      if (!res.ok || !json?.id) {
        throw new Error(
          `create failed (${res.status}): ${JSON.stringify(json)}`
        )
      }
      return json as Contract
    }

    const summary: { label: string; question: string; slug: string }[] = []

    const ensure = async (label: string, params: CreateMarketParams) => {
      const existing = await existingSlug(params.question)
      if (existing) {
        console.log(`skip  ${label}: ${params.question}`)
        summary.push({ label, question: params.question, slug: existing })
        return
      }
      try {
        const c = await create(params)
        console.log(`create ${label}: ${c.slug}`)
        summary.push({ label, question: params.question, slug: c.slug })
      } catch (e) {
        console.error(`ERROR ${label}: ${e instanceof Error ? e.message : e}`)
      }
      await sleep(DELAY_MS)
    }

    const partyMarket = (question: string): CreateMarketParams => ({
      question,
      outcomeType: 'MULTIPLE_CHOICE',
      answers: PARTY_ANSWERS,
      addAnswersMode: 'DISABLED',
      shouldAnswersSumToOne: true,
      closeTime: CLOSE_TIME,
      visibility: 'public',
      groupIds: [US_POLITICS_GROUP_ID],
      liquidityTier: LIQUIDITY_TIER,
    })

    // --- Senate ---
    for (const r of SENATE_RACES) {
      const q = r.special
        ? `Which party will win the 2026 ${r.state} U.S. Senate special election?`
        : `Which party will win the 2026 ${r.state} U.S. Senate election?`
      await ensure(`senate:${r.code}`, partyMarket(q))
    }

    // --- Governor ---
    for (const r of GOVERNOR_RACES) {
      const q = `Which party will win the 2026 ${r.state} governor's election?`
      await ensure(`governor:${r.code}`, partyMarket(q))
    }

    // --- House district market ---
    await ensure('house:districts', {
      question:
        '2026 House Races: which competitive districts will Republicans win?',
      outcomeType: 'MULTIPLE_CHOICE',
      answers: HOUSE_DISTRICTS,
      addAnswersMode: 'ANYONE',
      shouldAnswersSumToOne: false,
      closeTime: CLOSE_TIME,
      visibility: 'public',
      groupIds: [US_POLITICS_GROUP_ID],
      liquidityTier: LIQUIDITY_TIER,
      descriptionMarkdown:
        'Each answer resolves YES if a Republican wins that U.S. House district in the 2026 general election.',
    })

    // --- Conditional macro-outcome matrix ---
    for (const m of CONDITIONAL_METRICS) {
      for (const c of CONDITIONAL_CONFIGS) {
        const q = `If ${c.label} after the 2026 midterms, ${m.text}`
        await ensure(`conditional:${m.key}:${c.key}`, {
          question: q,
          outcomeType: 'BINARY',
          initialProb: 50,
          closeTime: new Date('2027-12-31T23:59:00.000Z').getTime(),
          visibility: 'public',
          groupIds: [US_POLITICS_GROUP_ID],
          liquidityTier: LIQUIDITY_TIER,
          descriptionMarkdown: `Resolves N/A if ${c.label.toLowerCase()} does not occur after the 2026 midterms.`,
        })
      }
    }

    console.log(`\n===== SUMMARY (${summary.length} markets) =====`)
    for (const s of summary) {
      console.log(`${s.label}\t${s.slug}`)
    }
  })
}
