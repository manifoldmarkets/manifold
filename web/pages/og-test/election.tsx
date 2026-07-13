import { buildOgUrl } from 'common/util/og'
import { OgElection } from 'web/components/og/og-election'
import { getSenateOgFills } from 'web/lib/politics/election-og'
import { getStateContracts } from 'web/lib/politics/home'
import { getContractFromSlug } from 'common/supabase/contracts'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import { senate2026 } from 'web/public/data/senate-state-data'

// should match the election page's getStaticProps senate fetch.
export async function getStaticProps() {
  const adminDb = await initSupabaseAdmin()
  const senateContracts = await getStateContracts(
    (slug) => getContractFromSlug(adminDb, slug),
    senate2026
  )

  return {
    props: { fills: getSenateOgFills(senateContracts) },
    revalidate: 60,
  }
}

export default function OGTestPage(props: { fills: string }) {
  const { fills } = props

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center">
      <div className="text-ink-900 mb-2 mt-6 text-xl">social preview image</div>
      <img
        src={buildOgUrl({ fills }, 'election', 'http://localhost:3000')}
        height={315}
        width={600}
        alt=""
      />

      <div className="text-ink-900 mb-2 mt-6 text-xl">
        og card component (try inspecting)
      </div>
      <div className="h-[315px] w-[600px] resize overflow-hidden">
        <OgElection fills={fills} />
      </div>
    </div>
  )
}
