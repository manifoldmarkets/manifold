import { CPMMMultiContract, Contract } from 'common/contract'
import { fetchLinkPreviews } from 'common/link-preview'
import {
  ElectionsPageProps,
  MapContractsDictionary,
  NH_LINK,
  presidency2024,
} from 'common/politics/elections-data'
import { getContractFromSlug } from 'common/supabase/contracts'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import { StateElectionMarket } from 'web/public/data/elections-data'
import { governors2024 } from 'web/public/data/governors-data'
import { senate2024 } from 'web/public/data/senate-state-data'
import { api } from 'web/lib/firebase/api'
import { getDashboardProps } from 'web/lib/politics/news-dashboard'
import { PolicyContractType, PolicyData } from 'common/politics/policy-data'
import { getBetPoints } from 'common/supabase/bets'
import { getMultiBetPoints } from 'common/contract-params'
import { unserializeMultiPoints } from 'common/chart'

export async function getElectionsPageProps() {
  const adminDb = await initSupabaseAdmin()
  const getContract = (slug: string) => getContractFromSlug(slug, adminDb)

  const [
    presidencyStateContracts,
    senateStateContracts,
    governorStateContracts,
    headlines,
  ] = await Promise.all([
    getStateContracts(getContract, presidency2024),
    getStateContracts(getContract, senate2024),
    getStateContracts(getContract, governors2024),
    api('politics-headlines', {}),
  ])

  const policyContracts = await getPolicyContracts(getContract)

  const newsDashboards = await Promise.all(
    headlines.map(async (headline) => getDashboardProps(headline.slug))
  )

  const trendingDashboard = await getDashboardProps('politicsheadline')

  const specialContractSlugs = [
    'which-party-will-win-the-2024-us-pr-f4158bf9278a',
    'who-will-win-the-2024-us-presidenti-8c1c8b2f8964',
    'who-will-win-the-2024-republican-pr-e1332cf40e59',
    'who-will-win-the-2024-democratic-pr-47576e90fa38',
    'who-will-win-the-new-hampshire-repu',
    'who-will-be-the-republican-nominee-8a36dedc6445',
    'who-will-be-the-democratic-nominee-9d4a78f63ce1',
    'who-would-win-the-us-presidential-e-e43c62c31980',
    'who-would-win-the-us-presidential-e-2f4e0b318013',
  ]
  const contractsPromises = specialContractSlugs.map(async (slug) =>
    getContract(slug)
  )

  const [
    electionPartyContract,
    electionCandidateContract,
    republicanCandidateContract,
    democratCandidateContract,
    newHampshireContract,
    republicanVPContract,
    democraticVPContract,
    democraticElectability,
    republicanElectability,
  ] = await Promise.all(contractsPromises)

  const linkPreviews = await fetchLinkPreviews([NH_LINK])
  const afterTime = new Date().getTime() - 7 * 24 * 60 * 60 * 1000

  let partyPoints = null
  if (
    electionPartyContract &&
    electionPartyContract.mechanism == 'cpmm-multi-1'
  ) {
    const allBetPoints = await getBetPoints(adminDb, electionPartyContract.id, {
      afterTime: afterTime,
    })
    const serializedMultiPoints = getMultiBetPoints(
      allBetPoints,
      electionPartyContract as CPMMMultiContract
    )
    partyPoints = unserializeMultiPoints(serializedMultiPoints)
  }

  return {
    rawPresidencyStateContracts: presidencyStateContracts,
    rawSenateStateContracts: senateStateContracts,
    rawGovernorStateContracts: governorStateContracts,
    rawPolicyContracts: policyContracts,
    electionPartyContract,
    electionCandidateContract,
    republicanCandidateContract,
    democratCandidateContract,
    newHampshireContract,
    republicanVPContract,
    democraticVPContract,
    democraticElectability,
    republicanElectability,
    linkPreviews,
    newsDashboards,
    headlines,
    trendingDashboard,
    partyGraphData: { partyPoints, afterTime },
  } as ElectionsPageProps
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

  // Convert array to dictionary
  const mapContractsDictionary: MapContractsDictionary =
    mapContractsArray.reduce((acc, mapContract) => {
      acc[mapContract.state] = mapContract.contract
      return acc
    }, {} as MapContractsDictionary)

  return mapContractsDictionary
}

async function getPolicyContracts(
  getContract: (slug: string) => Promise<Contract | null>
): Promise<PolicyContractType[]> {
  const mapContractsPromises = PolicyData.map(async (m) => {
    const bidenContract = await getContract(m.bidenSlug)
    const trumpContract = await getContract(m.trumpSlug)
    return {
      title: m.title,
      bidenContract: bidenContract,
      trumpContract: trumpContract,
    }
  })

  const mapContractsArray = await Promise.all(mapContractsPromises)

  return mapContractsArray
}
