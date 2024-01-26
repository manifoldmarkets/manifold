import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import {
  MapContractsDictionary,
  NH_LINK,
  presidency2024,
} from 'common/election-contract-data'
import { getContractFromSlug } from 'common/supabase/contracts'
import { fetchLinkPreviews } from 'common/link-preview'

export async function getDashboardProps() {
  const adminDb = await initSupabaseAdmin()

  const mapContractsPromises = presidency2024.map((m) =>
    getContractFromSlug(m.slug, adminDb).then((contract) => {
      return { state: m.state, contract: contract }
    })
  )

  const mapContractsArray = await Promise.all(mapContractsPromises)

  // Convert array to dictionary
  const mapContractsDictionary: MapContractsDictionary =
    mapContractsArray.reduce((acc, mapContract) => {
      acc[mapContract.state] = mapContract.contract
      return acc
    }, {} as MapContractsDictionary)

  const electionPartyContract = await getContractFromSlug(
    'which-party-will-win-the-2024-us-pr-f4158bf9278a',
    adminDb
  )

  const electionCandidateContract = await getContractFromSlug(
    'who-will-win-the-2024-us-presidenti-8c1c8b2f8964',
    adminDb
  )

  const republicanCandidateContract = await getContractFromSlug(
    'who-will-win-the-2024-republican-pr-e1332cf40e59',
    adminDb
  )

  const democratCandidateContract = await getContractFromSlug(
    'who-will-win-the-2024-democratic-pr-47576e90fa38',
    adminDb
  )

  const newHampshireContract = await getContractFromSlug(
    'who-will-win-the-new-hampshire-repu',
    adminDb
  )
  const republicanVPContract = await getContractFromSlug(
    'who-will-be-the-republican-nominee-8a36dedc6445',
    adminDb
  )

  const linkPreviews = await fetchLinkPreviews([NH_LINK])
  return {
    rawMapContractsDictionary: mapContractsDictionary,
    electionPartyContract: electionPartyContract,
    electionCandidateContract: electionCandidateContract,
    republicanCandidateContract: republicanCandidateContract,
    democratCandidateContract: democratCandidateContract,
    newHampshireContract: newHampshireContract,
    republicanVPContract: republicanVPContract,
    linkPreviews: linkPreviews,
  }
}
