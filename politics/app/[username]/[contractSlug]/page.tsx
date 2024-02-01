import { db } from 'web/lib/supabase/db'
import { getContractFromSlug } from 'common/supabase/contracts'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import type { Metadata } from 'next'
import { getContractParams } from 'politics/app/[username]/[contractSlug]/get-contract-params'
import { ContractPage } from 'politics/app/[username]/[contractSlug]/contract-page'
import Custom404 from 'politics/app/404/page'
import { getContractOGProps, getSeoDescription } from 'common/contract-seo'
import { removeUndefinedProps } from 'common/util/object'
import { buildOgUrl } from 'common/util/og'
import { ENV_CONFIG } from 'common/envs/constants'

export async function generateMetadata(props: {
  params: { contractSlug: string }
}): Promise<Metadata> {
  const contract = await getContractFromSlug(props.params.contractSlug, db)
  if (!contract) return { title: 'Not found' }
  const description = getSeoDescription(contract)
  const adminDb = await initSupabaseAdmin()
  const params = await getContractParams(contract, adminDb)
  const imageUrl = buildOgUrl(
    removeUndefinedProps({
      ...getContractOGProps(contract),
      points: params.pointsString,
    }) as Record<string, string>,
    'market',
    ENV_CONFIG.politicsDomain
  )
  return {
    title: contract.question,
    openGraph: {
      images: [imageUrl],
      url: `https://${ENV_CONFIG.politicsDomain}/${contract.creatorUsername}/${contract.slug}`,
    },
    twitter: {
      images: [imageUrl],
    },
    robots: contract.visibility === 'public' ? undefined : 'noindex, nofollow',
    description,
  }
}

export default async function Page({
  params,
}: {
  params: { contractSlug: string }
}) {
  const { contractSlug } = params
  const adminDb = await initSupabaseAdmin()
  const contract = (await getContractFromSlug(contractSlug, adminDb)) ?? null
  if (!contract || contract.visibility === 'private' || contract.deleted) {
    return <Custom404 />
  }

  const props = await getContractParams(contract, adminDb)
  return <ContractPage contractParams={props} />
}
