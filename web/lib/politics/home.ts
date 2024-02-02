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
import { Contract } from '../firebase/contracts'
import { getBetPoints, getBets } from 'common/supabase/bets'
import { Bet } from '../firebase/bets'
import {
  ChartAnnotation,
  getChartAnnotations,
} from 'common/supabase/chart-annotations'
import { getSingleBetPoints, getMultiBetPoints } from 'common/contract-params'
import { pointsToBase64 } from 'common/util/og'
import { MultiSerializedPoints, SerializedPoint, binAvg } from 'common/chart'
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

  let historyDataProps = undefined
  let chartAnnotationsProps: ChartAnnotation[] = []
  if (!!electionPartyContract) {
    const { historyData, chartAnnotations } = await getChartParams(
      electionPartyContract,
      adminDb
    )
    historyDataProps = historyData
    chartAnnotationsProps = chartAnnotations
  }

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
    partyChartParams: historyDataProps
      ? {
          historyData: historyDataProps,
          chartAnnotations: chartAnnotationsProps,
        }
      : undefined,
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

export type ChartParams = {
  historyData: {
    bets: Bet[]
    points: MultiSerializedPoints | SerializedPoint<Partial<Bet>>[]
  }
  chartAnnotations: ChartAnnotation[]
}

export const getChartParams = async function (
  contract: Contract,
  db: SupabaseClient
): Promise<ChartParams> {
  const isCpmm1 = contract.mechanism === 'cpmm-1'
  const hasMechanism = contract.mechanism !== 'none'
  const isMulti = contract.mechanism === 'cpmm-multi-1'
  const isBinaryDpm =
    contract.outcomeType === 'BINARY' && contract.mechanism === 'dpm-2'

  // TODO: add unstable_cache where applicable
  const [betsToPass, allBetPoints, betReplies, chartAnnotations] =
    await Promise.all([
      hasMechanism
        ? getBets(db, {
            contractId: contract.id,
            limit: 100,
            order: 'desc',
            filterAntes: true,
            filterRedemptions: true,
          })
        : ([] as Bet[]),
      hasMechanism
        ? getBetPoints(db, contract.id, {
            filterRedemptions: contract.mechanism !== 'cpmm-multi-1',
            limit: 10000,
          })
        : [],
      isCpmm1
        ? getBets(db, {
            contractId: contract.id,
            commentRepliesOnly: true,
          })
        : ([] as Bet[]),
      getChartAnnotations(contract.id, db),
    ])

  const chartPoints =
    isCpmm1 || isBinaryDpm
      ? getSingleBetPoints(allBetPoints, contract)
      : isMulti
      ? getMultiBetPoints(allBetPoints, contract)
      : []
  const ogPoints =
    isCpmm1 && contract.visibility !== 'private' ? binAvg(allBetPoints) : []
  return {
    historyData: {
      bets: betsToPass.concat(
        betReplies.filter(
          (b1) => !betsToPass.map((b2) => b2.id).includes(b1.id)
        )
      ),
      points: chartPoints,
    },
    chartAnnotations,
  }
}
