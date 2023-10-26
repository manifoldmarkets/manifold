import { ContractParams, MaybeAuthedContractParams } from 'common/contract'
import { getContractParams } from 'common/contract-params'
import { getContractOGProps } from 'common/contract-seo'
import { getContractFromSlug } from 'common/supabase/contracts'
import { removeUndefinedProps } from 'common/util/object'
import { buildOgUrl } from 'common/util/og'
import { OgMarket } from 'web/components/og/og-market'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'

// All of this is very copied from main page

export async function getStaticProps(ctx: {
  params: { username: string; contractSlug: string }
}) {
  const { contractSlug } = ctx.params
  const adminDb = await initSupabaseAdmin()
  const contract = (await getContractFromSlug(contractSlug, adminDb)) ?? null

  if (!contract || contract.visibility === 'private' || contract.deleted) {
    return {
      props: { state: 'not found' },
      revalidate: 60,
    }
  }

  const props = await getContractParams(contract, adminDb)
  return { props }
}

export default function OGTestPage(props: MaybeAuthedContractParams) {
  if (props.state !== 'authed') {
    return <>bruh</>
  }

  return <OriginalGangstaTestPage {...props.params} />
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

function OriginalGangstaTestPage(props: ContractParams) {
  const { contract, pointsString } = props
  const ogCardProps = removeUndefinedProps({
    ...getContractOGProps(contract),
    points: pointsString,
  })

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center">
      <div className="text-ink-900 mb-2 mt-6 text-xl">social preview image</div>
      <img
        src={buildOgUrl(ogCardProps as any, 'market')}
        height={300}
        width={600}
      />

      <div className="text-ink-900 mb-2 mt-6 text-xl">
        og card component (try inspecting)
      </div>
      <div className="isolate h-[300px] w-[600px] resize overflow-hidden">
        <OgMarket {...ogCardProps} />h
      </div>
    </div>
  )
}
