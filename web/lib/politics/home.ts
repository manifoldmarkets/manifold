import { uniqBy } from 'lodash'

import { Contract } from 'common/contract'
import { getContractFromSlug } from 'common/supabase/contracts'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import {
  ElectionsPageProps,
  MapContractsDictionary,
  MIDTERMS_2026,
  PRESIDENT_2028_SLUG,
  PRESIDENT_2028_PARTY_SLUG,
  PRIMARIES_2026,
  REDISTRICTING_2026,
  StateElectionMarket,
} from 'web/public/data/elections-data'
import {
  governors2026,
  governorCandidates2026,
} from 'web/public/data/governors-data'
import {
  senate2026,
  senateCandidates2026,
} from 'web/public/data/senate-state-data'
import { api } from 'web/lib/api/api'

// The Trending carousel picks itself: the hottest open midterm markets right
// now, by dailyScore (the platform's rolling one-day activity metric, kept
// current by the score-contracts job), backfilled with the best overall (by
// score) so the row stays full on slow news days. It re-fetches on every ISR
// revalidation, so it can't drift the way the old hand-curated
// politicsheadline dashboard did.
const TRENDING_TOPIC_SLUG = '2026-midterms'
const TRENDING_SIZE = 10

async function getTrendingMidtermContracts(): Promise<Contract[]> {
  try {
    const [hotToday, bestOverall] = await Promise.all([
      api('search-markets-full', {
        term: '',
        sort: 'daily-score',
        filter: 'open',
        topicSlug: TRENDING_TOPIC_SLUG,
        limit: TRENDING_SIZE * 2,
      }),
      api('search-markets-full', {
        term: '',
        sort: 'score',
        filter: 'open',
        topicSlug: TRENDING_TOPIC_SLUG,
        limit: TRENDING_SIZE,
      }),
    ])
    // The hero markets (balance of power, chamber control, districts) are
    // always visible just below the carousel — don't spend slots on them.
    const featured = Object.values(MIDTERMS_2026) as string[]
    const hot = hotToday.filter(
      (c) => Number.isFinite(c.dailyScore) && c.dailyScore > 0
    )
    return uniqBy([...hot, ...bestOverall], (c) => c.id)
      .filter((c) => !featured.includes(c.slug))
      .slice(0, TRENDING_SIZE)
  } catch (e) {
    // Trending is a nice-to-have: render the page without it rather than
    // failing the whole revalidation when search is unavailable.
    console.error('getTrendingMidtermContracts failed', e)
    return []
  }
}

export async function getElectionsPageProps(): Promise<ElectionsPageProps> {
  const adminDb = await initSupabaseAdmin()
  const getContractFromSlugFunction = (slug: string) =>
    getContractFromSlug(adminDb, slug)

  const [
    senateStateContracts,
    governorStateContracts,
    senateCandidateContracts,
    governorCandidateContracts,
    trendingContracts,
    balanceOfPowerContract,
    houseControlContract,
    senateControlContract,
    houseDistrictsContract,
    presidency2028Contract,
    presidency2028PartyContract,
    primaryContractsRaw,
    redistrictingContractsRaw,
  ] = await Promise.all([
    getStateContracts(getContractFromSlugFunction, senate2026),
    getStateContracts(getContractFromSlugFunction, governors2026),
    getStateContracts(getContractFromSlugFunction, senateCandidates2026),
    getStateContracts(getContractFromSlugFunction, governorCandidates2026),
    getTrendingMidtermContracts(),
    getContractFromSlugFunction(MIDTERMS_2026.balanceOfPower),
    getContractFromSlugFunction(MIDTERMS_2026.houseControl),
    getContractFromSlugFunction(MIDTERMS_2026.senateControl),
    getContractFromSlugFunction(MIDTERMS_2026.houseDistricts),
    getContractFromSlugFunction(PRESIDENT_2028_SLUG),
    getContractFromSlugFunction(PRESIDENT_2028_PARTY_SLUG),
    Promise.all(PRIMARIES_2026.map(getContractFromSlugFunction)),
    Promise.all(REDISTRICTING_2026.map(getContractFromSlugFunction)),
  ])

  // Keep only primaries that still exist and are open (so the watch-list shrinks
  // gracefully as races resolve, rather than showing stale/settled markets).
  const primaryContracts = primaryContractsRaw.filter(
    (c): c is Contract => !!c && !c.isResolved && !c.resolution
  )

  // Same for redistricting markets — open only, so settled questions drop off.
  const redistrictingContracts = redistrictingContractsRaw.filter(
    (c): c is Contract => !!c && !c.isResolved && !c.resolution
  )

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
    primaryContracts,
    redistrictingContracts,
    trendingContracts,
  }
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
