import { Contract } from 'common/contract'
import { fetchLinkPreviews } from 'common/link-preview'
import {
  MapContractsDictionary,
  NH_LINK,
  presidency2024,
} from 'common/politics/elections-data'
import { getContractFromSlug } from 'common/supabase/contracts'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import { StateElectionMarket } from 'web/public/data/elections-data'
import { governors2024 } from 'web/public/data/governors-data'
import { senate2024 } from 'web/public/data/senate-state-data'
export const REVALIDATE_CONTRACTS_SECONDS = 60

export async function getElectionsPageProps() {
  const adminDb = await initSupabaseAdmin()
  const getContract = (slug: string) => getContractFromSlug(slug, adminDb)

  const presidencyStateContracts = await getStateContracts(
    getContract,
    presidency2024
  )

  const senateStateContracts = await getStateContracts(getContract, senate2024)

  const governorStateContracts = await getStateContracts(
    getContract,
    governors2024
  )

  const specialContractSlugs = [
    'which-party-will-win-the-2024-us-pr-f4158bf9278a',
    'who-will-win-the-2024-us-presidenti-8c1c8b2f8964',
    'who-will-win-the-2024-republican-pr-e1332cf40e59',
    'who-will-win-the-2024-democratic-pr-47576e90fa38',
    'who-will-win-the-new-hampshire-repu',
    'who-will-be-the-republican-nominee-8a36dedc6445',
    'who-will-be-the-democratic-nominee-9d4a78f63ce1',
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
  ] = await Promise.all(contractsPromises)

  const linkPreviews = await fetchLinkPreviews([NH_LINK])

  return {
    rawPresidencyStateContracts: presidencyStateContracts,
    rawSenateStateContracts: senateStateContracts,
    rawGovernorStateContracts: governorStateContracts,
    electionPartyContract: electionPartyContract,
    electionCandidateContract: electionCandidateContract,
    republicanCandidateContract: republicanCandidateContract,
    democratCandidateContract: democratCandidateContract,
    newHampshireContract: newHampshireContract,
    republicanVPContract: republicanVPContract,
    democraticVPContract: democraticVPContract,
    linkPreviews: linkPreviews,
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

  // Convert array to dictionary
  const mapContractsDictionary: MapContractsDictionary =
    mapContractsArray.reduce((acc, mapContract) => {
      acc[mapContract.state] = mapContract.contract
      return acc
    }, {} as MapContractsDictionary)

  return mapContractsDictionary
}
