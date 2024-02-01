import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import {
  MapContractsDictionary,
  NH_LINK,
  presidency2024,
} from 'common/politics/elections-data'
import { getContractFromSlug } from 'common/supabase/contracts'
import { fetchLinkPreviews } from 'common/link-preview'
import { unstable_cache } from 'next/cache'
import { SupabaseClient } from 'common/supabase/utils'
export const REVALIDATE_CONTRACTS_SECONDS = 60

export async function getElectionsPageProps(useUnstableCache: boolean) {
  const adminDb = await initSupabaseAdmin()
  const getContract = (slug: string) =>
    useUnstableCache
      ? getCachedContractFromSlug(slug, adminDb)
      : getContractFromSlug(slug, adminDb)

  const mapContractsPromises = presidency2024.map(async (m) => {
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
    rawMapContractsDictionary: mapContractsDictionary,
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

function getCachedContractFromSlug(slug: string, db: SupabaseClient) {
  return unstable_cache(
    async () => {
      if (slug === presidency2024[0].slug)
        console.log('re-fetching dashboard contracts')
      return getContractFromSlug(slug, db)
    },
    [slug],
    {
      revalidate: REVALIDATE_CONTRACTS_SECONDS,
    }
  )()
}
