import { uniqBy } from 'lodash'

import { Contract } from 'common/contract'
import { getContractFromSlug, getContracts } from 'common/supabase/contracts'
import { MEASURE_CONTRACT_IDS } from 'web/components/usa-map/ballot-measures-model'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import {
  ElectionsPageProps,
  MapContractsDictionary,
  MIDTERMS_2026,
  PRESIDENT_2028_SLUG,
  PRESIDENT_2028_PARTY_SLUG,
  POLLING_PERPS,
  StateElectionMarket,
} from 'web/public/data/elections-data'
import { getPartyProbs } from 'web/components/usa-map/state-election-map'
import {
  governors2026,
  governorCandidates2026,
} from 'web/public/data/governors-data'
import {
  senate2026,
  senateCandidates2026,
} from 'web/public/data/senate-state-data'
import { api } from 'web/lib/api/api'
import {
  HOUSE_DISTRICT_MARKETS,
  HOUSE_RACE_MARKETS,
} from 'web/public/data/house-market-data'
import {
  curateTrendingMarkets,
  MIDTERM_CONTEST_TOPIC_SLUG,
  rankContestMarkets,
} from 'web/lib/politics/election-curation'
import {
  buildMidtermConditionalRows,
  conditionalRowContracts,
  MidtermConditionalRow,
  midtermConditionalRefs,
} from 'web/lib/politics/midterm-conditionals'

// Sections this branch adds to the page. The base ElectionsPageProps type lives
// in web/public/data/elections-data.ts (owned by the data workstream), so the
// additions are layered on here. They are optional on the component side so
// the other pages that render USElectionsPage keep compiling.
export type MidtermSpotlightProps = {
  // Jack1's Manifold Midterm Contest: its most-traded open markets.
  contestContracts: Contract[]
  // Markets conditional on the midterm result (curated list).
  conditionalRows: MidtermConditionalRow[]
}
export type MidtermsPageProps = ElectionsPageProps & MidtermSpotlightProps

const CONTEST_SIZE = 8

async function getContestContracts(now: number): Promise<Contract[]> {
  try {
    const results = await api('search-markets-full', {
      term: '',
      sort: 'most-popular',
      filter: 'open',
      topicSlug: MIDTERM_CONTEST_TOPIC_SLUG,
      limit: 50,
    })
    return rankContestMarkets(results, { now, limit: CONTEST_SIZE })
  } catch (e) {
    // A spotlight, not the page's purpose: render without it rather than fail
    // the revalidation.
    console.error('getContestContracts failed', e)
    return []
  }
}

// The curated conditional markets, by slug or by id. Ids may be reserved before
// their markets exist: getContracts returns only the rows it finds, so those
// are skipped until the markets are created.
async function getConditionalContracts(
  adminDb: Awaited<ReturnType<typeof initSupabaseAdmin>>,
  getBySlug: (slug: string) => Promise<Contract | null>
): Promise<Contract[]> {
  const { slugs, ids } = midtermConditionalRefs()
  try {
    const [bySlug, byId] = await Promise.all([
      Promise.all(slugs.map(getBySlug)),
      getContracts(adminDb, ids, 'id', true),
    ])
    return [...bySlug.filter((c): c is Contract => !!c), ...byId]
  } catch (e) {
    console.error('getConditionalContracts failed', e)
    return []
  }
}

// The Trending carousel picks itself: the hottest open midterm markets right
// now, by dailyScore (the platform's rolling one-day activity metric, kept
// current by the score-contracts job), backfilled with the most-traded so the
// row stays full on slow news days. It re-fetches on every ISR revalidation,
// so it can't drift the way the old hand-curated politicsheadline dashboard
// did. curateTrendingMarkets then keeps it launch-worthy: federal and
// governor races only, at least 10 traders, at most two per creator, and
// nothing already shown elsewhere on the page.
const TRENDING_TOPIC_SLUG = '2026-midterms'
const TRENDING_POOL_SIZE = 40

async function getTrendingCandidates(): Promise<Contract[]> {
  try {
    const [hotToday, mostTraded] = await Promise.all([
      api('search-markets-full', {
        term: '',
        sort: 'daily-score',
        filter: 'open',
        topicSlug: TRENDING_TOPIC_SLUG,
        limit: TRENDING_POOL_SIZE,
      }),
      api('search-markets-full', {
        term: '',
        sort: 'most-popular',
        filter: 'open',
        topicSlug: TRENDING_TOPIC_SLUG,
        limit: TRENDING_POOL_SIZE,
      }),
    ])
    const hot = hotToday.filter(
      (c) => Number.isFinite(c.dailyScore) && c.dailyScore > 0
    )
    return [...hot, ...mostTraded]
  } catch (e) {
    // Trending is a nice-to-have: render the page without it rather than
    // failing the whole revalidation when search is unavailable.
    console.error('getTrendingCandidates failed', e)
    return []
  }
}

export async function getElectionsPageProps(): Promise<MidtermsPageProps> {
  const now = Date.now()
  const adminDb = await initSupabaseAdmin()
  const getContractFromSlugFunction = (slug: string) =>
    getContractFromSlug(adminDb, slug)

  const [
    senateStateContracts,
    governorStateContracts,
    senateCandidateContracts,
    governorCandidateContracts,
    trendingCandidates,
    contestContracts,
    conditionalContracts,
    balanceOfPowerContract,
    houseControlContract,
    senateControlContract,
    houseDistrictsContract,
    presidency2028Contract,
    presidency2028PartyContract,
    pollingPerpsRaw,
    additionalHouseEntries,
    ballotContracts,
  ] = await Promise.all([
    getStateContracts(getContractFromSlugFunction, senate2026),
    getStateContracts(getContractFromSlugFunction, governors2026),
    getStateContracts(getContractFromSlugFunction, senateCandidates2026),
    getStateContracts(getContractFromSlugFunction, governorCandidates2026),
    getTrendingCandidates(),
    getContestContracts(now),
    getConditionalContracts(adminDb, getContractFromSlugFunction),
    getContractFromSlugFunction(MIDTERMS_2026.balanceOfPower),
    getContractFromSlugFunction(MIDTERMS_2026.houseControl),
    getContractFromSlugFunction(MIDTERMS_2026.senateControl),
    getContractFromSlugFunction(MIDTERMS_2026.houseDistricts),
    getContractFromSlugFunction(PRESIDENT_2028_SLUG),
    getContractFromSlugFunction(PRESIDENT_2028_PARTY_SLUG),
    Promise.all(POLLING_PERPS.map(getContractFromSlugFunction)),
    Promise.all(
      [...HOUSE_DISTRICT_MARKETS, ...HOUSE_RACE_MARKETS.map((m) => m.slug)].map(
        async (slug) => [slug, await getContractFromSlugFunction(slug)] as const
      )
    ),
    getContracts(adminDb, MEASURE_CONTRACT_IDS, 'id', true).catch((e) => {
      console.error('Ballot measure markets unavailable', e)
      return [] as Contract[]
    }),
  ])

  // Polling perps, open only — so a retired feed drops off the row by itself.
  const pollingPerpContracts = pollingPerpsRaw.filter(
    (c): c is Contract => !!c && !c.isResolved && !c.resolution
  )

  // The closest open races across both maps, derived rather than curated.
  const tossUpContracts = getTossUpRaces([
    senateStateContracts,
    governorStateContracts,
  ])

  const conditionalRows = buildMidtermConditionalRows(conditionalContracts, now)

  // Nothing twice: the hero markets (balance of power, chamber control,
  // districts) and the contest, conditional and polling sections are all on
  // the page already.
  const trendingContracts = curateTrendingMarkets(trendingCandidates, {
    now,
    excludeSlugs: Object.values(MIDTERMS_2026) as string[],
    excludeIds: [
      ...contestContracts,
      ...conditionalRowContracts(conditionalRows),
      ...pollingPerpContracts,
    ].map((c) => c.id),
  })

  return {
    presidency2028Contract,
    presidency2028PartyContract,
    rawSenateStateContracts: senateStateContracts,
    rawGovernorStateContracts: governorStateContracts,
    rawSenateCandidateContracts: senateCandidateContracts,
    rawGovernorCandidateContracts: governorCandidateContracts,
    balanceOfPowerContract,
    houseControlContract,
    senateControlContract,
    houseDistrictsContract,
    additionalHouseContracts: Object.fromEntries(additionalHouseEntries),
    ballotMeasureContracts: Object.fromEntries(
      ballotContracts.map((c) => [c.id, c])
    ),
    tossUpContracts,
    pollingPerpContracts,
    // The Redistricting section was retired for launch (its questions had all
    // settled at 1-3% or 97-98%); the contest and conditional sections replace
    // it. The field stays because ElectionsPageProps still requires it.
    redistrictingContracts: [],
    trendingContracts,
    contestContracts,
    conditionalRows,
  }
}

// The general-election counterpart to the retired primaries watch-list: the
// closest open races across the Senate and Governor maps.
//
// "Close" is measured on the two-party split from getPartyProbs (the same
// helper the map colours states with), so it tolerates the inconsistent party
// labelling in community markets. Anything outside 30-70% is a safe seat and
// not worth a slot; the rest are sorted by distance from an even split.
//
// Derived from contracts already fetched for the maps, so this costs no extra
// queries, and it re-derives on every ISR revalidation — it cannot go stale the
// way a curated slug list does.
const TOSS_UP_BAND = 0.3
const MAX_TOSS_UPS = 6

export function getTossUpRaces(
  dictionaries: MapContractsDictionary[]
): Contract[] {
  const scored = dictionaries
    .flatMap((d) => Object.values(d))
    .filter((c): c is Contract => !!c && !c.isResolved && !c.resolution)
    .map((contract) => {
      const probs = getPartyProbs(contract)
      if (!probs) return undefined
      // Renormalise across the two major parties: a market with a large
      // "other" answer (dem .35 / rep .35 / other .30) is an even race, and
      // should read as one rather than as two long-shots. Known limitation:
      // where the independent is the actual front-runner (NE, Dan Osborn)
      // this reads as a safe seat and drops out.
      const twoParty = probs.dem + probs.rep
      if (twoParty <= 0) return undefined
      const dem = probs.dem / twoParty
      return { contract, margin: Math.abs(dem - 0.5) }
    })
    .filter((x): x is { contract: Contract; margin: number } => !!x)
    .filter((x) => x.margin <= 0.5 - TOSS_UP_BAND)

  return uniqBy(
    scored.sort((a, b) => a.margin - b.margin).map((x) => x.contract),
    (c) => c.id
  ).slice(0, MAX_TOSS_UPS)
}

export async function getStateContracts(
  getContract: (slug: string) => Promise<Contract | null>,
  stateSlugs: StateElectionMarket[]
): Promise<MapContractsDictionary> {
  const mapContractsPromises = stateSlugs.map(async (m) => {
    const contract = await getContract(m.slug)
    return { state: m.state, contract: contract }
  })

  const mapContractsArray = await Promise.all(mapContractsPromises)

  // Convert array to dictionary, dropping states whose community market has
  // gone missing (deleted/renamed). The map renders those states uncolored
  // rather than crashing on a null contract in useLiveContract.
  return mapContractsArray.reduce((acc, mapContract) => {
    if (mapContract.contract) acc[mapContract.state] = mapContract.contract
    return acc
  }, {} as MapContractsDictionary)
}
