import {
  OgElection,
  OG_ELECTION_HEIGHT,
  OG_ELECTION_WIDTH,
} from 'web/components/og/og-election'
import { formatOgAsOf, getElectionOgProps } from 'web/lib/politics/election-og'
import { getContractFromSlug } from 'common/supabase/contracts'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import { MIDTERMS_2026 } from 'web/public/data/elections-data'

// should match the election page's getStaticProps fetches.
export async function getStaticProps() {
  const adminDb = await initSupabaseAdmin()
  const getContract = (slug: string) => getContractFromSlug(adminDb, slug)
  const [houseControlContract, senateControlContract] = await Promise.all([
    getContract(MIDTERMS_2026.houseControl),
    getContract(MIDTERMS_2026.senateControl),
  ])

  const og = getElectionOgProps({
    houseControlContract,
    senateControlContract,
    asOf: formatOgAsOf(Date.now()),
  })
  return {
    props: {
      houseRep: og.houseRep ?? null,
      senateRep: og.senateRep ?? null,
      asOf: og.asOf,
    },
    revalidate: 60,
  }
}

export default function OGTestPage(props: {
  houseRep: string | null
  senateRep: string | null
  asOf: string
}) {
  // Drop the nulls (getStaticProps can't serialize undefined) so absent stats
  // stay absent in both the query string and the component props.
  const stats = Object.fromEntries(
    Object.entries(props).filter(([, v]) => v !== null)
  ) as { [k: string]: string }

  return (
    <div className="flex min-h-screen w-screen flex-col items-center justify-center">
      <div className="text-ink-900 mb-2 mt-6 text-xl">social preview image</div>
      {/* Relative URL (unlike the other og-test pages) so this also works on
          Vercel preview deploys, where the real endpoint can be smoke-tested
          before merging. Shown at half size. */}
      <img
        src={`/api/og/election?${new URLSearchParams(stats)}`}
        height={OG_ELECTION_HEIGHT / 2}
        width={OG_ELECTION_WIDTH / 2}
        alt=""
      />

      <div className="text-ink-900 mb-2 mt-6 text-xl">
        og card component (try inspecting)
      </div>
      <div className="overflow-hidden">
        <OgElection {...stats} />
      </div>
    </div>
  )
}
