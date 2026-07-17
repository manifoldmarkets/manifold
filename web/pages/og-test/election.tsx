import { buildOgUrl } from 'common/util/og'
import { OgElection } from 'web/components/og/og-election'
import {
  getSenateControlRepPct,
  getSenateOgFills,
} from 'web/lib/politics/election-og'
import { getStateContracts } from 'web/lib/politics/home'
import { getContractFromSlug } from 'common/supabase/contracts'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import { senate2026 } from 'web/public/data/senate-state-data'
import { MIDTERMS_2026 } from 'web/public/data/elections-data'

// should match the election page's getStaticProps senate fetches.
export async function getStaticProps() {
  const adminDb = await initSupabaseAdmin()
  const [senateContracts, senateControlContract] = await Promise.all([
    getStateContracts((slug) => getContractFromSlug(adminDb, slug), senate2026),
    getContractFromSlug(adminDb, MIDTERMS_2026.senateControl),
  ])

  return {
    props: {
      fills: getSenateOgFills(senateContracts),
      rep: getSenateControlRepPct(senateControlContract) ?? null,
    },
    revalidate: 60,
  }
}

export default function OGTestPage(props: {
  fills: string
  rep: string | null
}) {
  const { fills } = props
  const rep = props.rep ?? undefined

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center">
      <div className="text-ink-900 mb-2 mt-6 text-xl">social preview image</div>
      <img
        src={buildOgUrl(
          { fills, ...(rep !== undefined && { rep }) },
          'election',
          'http://localhost:3000'
        )}
        height={315}
        width={600}
        alt=""
      />

      <div className="text-ink-900 mb-2 mt-6 text-xl">
        og card component (try inspecting)
      </div>
      <div className="h-[315px] w-[600px] resize overflow-hidden">
        <OgElection fills={fills} rep={rep} />
      </div>
    </div>
  )
}
