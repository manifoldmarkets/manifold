import { OgElection } from 'web/components/og/og-election'
import {
  getControlRepPct,
  getSenateOgFills,
  getWhiteHouse2028Probs,
} from 'web/lib/politics/election-og'
import { getStateContracts } from 'web/lib/politics/home'
import { getContractFromSlug } from 'common/supabase/contracts'
import { initSupabaseAdmin } from 'web/lib/supabase/admin-db'
import { senate2026 } from 'web/public/data/senate-state-data'
import {
  MIDTERMS_2026,
  PRESIDENT_2028_PARTY_SLUG,
} from 'web/public/data/elections-data'

// should match the election page's getStaticProps fetches.
export async function getStaticProps() {
  const adminDb = await initSupabaseAdmin()
  const getContract = (slug: string) => getContractFromSlug(adminDb, slug)
  const [senateContracts, houseControl, senateControl, whParty] =
    await Promise.all([
      getStateContracts(getContract, senate2026),
      getContract(MIDTERMS_2026.houseControl),
      getContract(MIDTERMS_2026.senateControl),
      getContract(PRESIDENT_2028_PARTY_SLUG),
    ])

  const wh = getWhiteHouse2028Probs(whParty)
  return {
    props: {
      fills: getSenateOgFills(senateContracts),
      houseRep: getControlRepPct(houseControl) ?? null,
      senateRep: getControlRepPct(senateControl) ?? null,
      whDem: wh?.whDem ?? null,
      whRep: wh?.whRep ?? null,
    },
    revalidate: 60,
  }
}

export default function OGTestPage(props: {
  fills: string
  houseRep: string | null
  senateRep: string | null
  whDem: string | null
  whRep: string | null
}) {
  const { fills } = props
  // Drop the nulls (getStaticProps can't serialize undefined) so absent stats
  // stay absent in both the query string and the component props.
  const stats = Object.fromEntries(
    Object.entries({
      houseRep: props.houseRep,
      senateRep: props.senateRep,
      whDem: props.whDem,
      whRep: props.whRep,
    }).filter(([, v]) => v !== null)
  ) as { [k: string]: string }

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center">
      <div className="text-ink-900 mb-2 mt-6 text-xl">social preview image</div>
      {/* Relative URL (unlike the other og-test pages) so this also works on
          Vercel preview deploys, where the real endpoint can be smoke-tested
          before merging. */}
      <img
        src={`/api/og/election?${new URLSearchParams({ fills, ...stats })}`}
        height={315}
        width={600}
        alt=""
      />

      <div className="text-ink-900 mb-2 mt-6 text-xl">
        og card component (try inspecting)
      </div>
      <div className="h-[315px] w-[600px] resize overflow-hidden">
        <OgElection fills={fills} {...stats} />
      </div>
    </div>
  )
}
