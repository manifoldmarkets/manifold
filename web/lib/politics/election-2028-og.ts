import type { OgElection2028Props } from 'web/components/og/og-election-2028'
import { lookupCandidate } from './candidates'
import { PHOTO_CREDITS } from './photo-credits'
import type { Elections2028PageProps } from './elections-2028'
import { settledPartyProbs } from './settlement'

const pct = (p: number) =>
  Number.isFinite(p)
    ? String(Math.round(Math.min(1, Math.max(0, p)) * 100))
    : undefined

// What the /api/og/election-2028 card shows: the party split and each
// party's nominee frontrunner, read at this revalidation.
export function getElection2028OgProps(
  props: Pick<Elections2028PageProps, 'partyContract' | 'charts'>,
  asOf: string
): OgElection2028Props {
  const party = settledPartyProbs(props.partyContract)
  const leader = (key: 'demNominee' | 'gopNominee') => {
    const top = props.charts.find((c) => c.key === key)?.series[0]
    if (!top) return {}
    const c = lookupCandidate(top.text)
    // Public-domain portraits only: the card has no room for a CC credit.
    const photo =
      c.photo && !PHOTO_CREDITS[c.photo]
        ? c.photo.match(/\/political-candidates\/([a-z0-9-]+)\.png$/)?.[1]
        : undefined
    return { name: c.shortName, pct: pct(top.prob), photo }
  }
  const dem = leader('demNominee')
  const rep = leader('gopNominee')
  const out: OgElection2028Props = {
    dem: party ? pct(party.dem) : undefined,
    rep: party ? pct(party.rep) : undefined,
    demName: dem.name,
    demPct: dem.pct,
    demPhoto: dem.photo,
    repName: rep.name,
    repPct: rep.pct,
    repPhoto: rep.photo,
    asOf,
  }
  // Next.js can't serialize undefined props.
  return Object.fromEntries(
    Object.entries(out).filter(([, v]) => v !== undefined)
  ) as OgElection2028Props
}
