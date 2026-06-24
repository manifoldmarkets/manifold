import { Contract } from 'common/contract'
import { getContractFromSlug } from 'common/supabase/contracts'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import {
  ElectionsPageProps,
  MapContractsDictionary,
  MIDTERMS_2026,
  PRESIDENT_2028_SLUG,
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
import { getDashboardProps } from 'web/lib/politics/news-dashboard'

export async function getElectionsPageProps(): Promise<ElectionsPageProps> {
  const adminDb = await initSupabaseAdmin()
  const getContractFromSlugFunction = (slug: string) =>
    getContractFromSlug(adminDb, slug)

  const [
    senateStateContracts,
    governorStateContracts,
    senateCandidateContracts,
    governorCandidateContracts,
    headlines,
    balanceOfPowerContract,
    houseControlContract,
    senateControlContract,
    houseDistrictsContract,
    presidency2028Contract,
  ] = await Promise.all([
    getStateContracts(getContractFromSlugFunction, senate2026),
    getStateContracts(getContractFromSlugFunction, governors2026),
    getStateContracts(getContractFromSlugFunction, senateCandidates2026),
    getStateContracts(getContractFromSlugFunction, governorCandidates2026),
    api('headlines', { slug: 'politics' }),
    getContractFromSlugFunction(MIDTERMS_2026.balanceOfPower),
    getContractFromSlugFunction(MIDTERMS_2026.houseControl),
    getContractFromSlugFunction(MIDTERMS_2026.senateControl),
    getContractFromSlugFunction(MIDTERMS_2026.houseDistricts),
    getContractFromSlugFunction(PRESIDENT_2028_SLUG),
  ])

  const newsDashboards = await Promise.all(
    headlines.map(async (headline) => getDashboardProps(headline.slug))
  )

  const trendingDashboard = await getDashboardProps('politicsheadline')

  return {
    presidency2028Contract,
    rawSenateStateContracts: senateStateContracts,
    rawGovernorStateContracts: governorStateContracts,
    rawSenateCandidateContracts: senateCandidateContracts,
    rawGovernorCandidateContracts: governorCandidateContracts,
    balanceOfPowerContract,
    houseControlContract,
    senateControlContract,
    houseDistrictsContract,
    newsDashboards,
    headlines,
    trendingDashboard,
  }
}

async function getStateContracts(
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
