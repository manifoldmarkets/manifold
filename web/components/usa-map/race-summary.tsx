import { LinkIcon } from '@heroicons/react/outline'
import toast from 'react-hot-toast'
import { Contract, contractPath } from 'common/contract'
import { ENV_CONFIG } from 'common/envs/constants'
import { referralQuery } from 'common/util/share'
import { useUser } from 'web/hooks/use-user'
import { copyToClipboard } from 'web/lib/util/copy'
import { trackShareEvent } from 'web/lib/service/analytics'
import { candidateForParty } from './election-candidates'
import { formatOdds } from './election-display'
import { getIncumbentGroups } from './election-incumbents'
import {
  ElectionMode,
  leadingParty,
  outcomeLabel,
  Race,
  Tier,
} from './election-map-model'
import { explorerSearch, ExplorerMode } from './explorer-url'
import { orderBallot, sourceNotes, UNSPECIFIED_RULES } from './race-outcomes'
import { DEM_COLOR, REP_COLOR } from './state-election-map'
import { OTHER_COLOR } from './election-map-model'
import styles from './election-explorer.module.css'

// Text tone for a tier or outcome: the map's party colors, adapted for dark
// mode in CSS (--dem, --rep, --other).
export const tierTone = (tier: Tier) =>
  tier.endsWith('-d')
    ? 'dem'
    : tier.endsWith('-r')
    ? 'rep'
    : tier === 'other'
    ? 'other'
    : undefined

// The race's headline: "D 60% · Troy Jackson", "Even", "No party odds yet".
export function raceQuoteText(race: Race) {
  const party = leadingParty(race.odds)
  if (race.basis?.kind === 'ballot')
    return `Only ${
      race.basis.party === 'D' ? 'Democrats' : 'Republicans'
    } on ballot`
  if (race.basis?.kind === 'decided')
    return `${race.basis.party} · elected unopposed`
  if (race.basis?.kind === 'candidate-only' || !race.odds)
    return 'No party odds yet'
  if (!party) return 'Even'
  return `${outcomeLabel(party)} ${formatOdds(race.odds[party] ?? 0)}`
}

export function RaceQuote({ race }: { race: Race }) {
  const party = leadingParty(race.odds)
  const priced =
    !!race.odds &&
    race.basis?.kind !== 'ballot' &&
    race.basis?.kind !== 'decided' &&
    race.basis?.kind !== 'candidate-only'
  const candidate = priced ? candidateForParty(race, party) : undefined
  const tone =
    race.basis?.kind === 'ballot' || race.basis?.kind === 'decided'
      ? race.basis.party === 'D'
        ? 'dem'
        : 'rep'
      : !priced
      ? undefined
      : party === 'dem'
      ? 'dem'
      : party === 'rep'
      ? 'rep'
      : party === 'other'
      ? 'other'
      : undefined
  return (
    <span className={styles.quote} data-tone={tone}>
      {raceQuoteText(race)}
      {candidate && <span className={styles.quoteName}> · {candidate}</span>}
    </span>
  )
}

export function BallotCandidates({ race }: { race: Race }) {
  if (
    !race.candidates?.length ||
    race.basis?.kind === 'ballot' ||
    race.basis?.kind === 'decided'
  )
    return null
  return (
    <p className={styles.note}>
      On ballot:{' '}
      {orderBallot(race.candidates, race.odds)
        .map((c) =>
          c.party === 'unknown' || c.party === 'other'
            ? c.name
            : `${c.name} (${c.party})`
        )
        .join(' · ')}
    </p>
  )
}

export function IncumbentDetails({
  mode,
  state,
  district,
}: {
  mode: ElectionMode
  state: string
  district?: number
}) {
  const groups = getIncumbentGroups(mode, state, district)
  return (
    <>
      {groups.map((group) => (
        <div key={group.label} className={styles.incumbents}>
          <span className={styles.eyebrow}>{group.label}</span>
          {group.members.length === 0 && <span>Vacant</span>}
          {group.members.map((member) => (
            <span key={member.name}>
              <i
                style={{
                  background:
                    member.party === 'Democrat'
                      ? DEM_COLOR
                      : member.party === 'Republican'
                      ? REP_COLOR
                      : OTHER_COLOR,
                }}
              />
              {member.name}{' '}
              <small>
                ({member.party === 'Independent' ? 'I' : member.party[0]})
              </small>
            </span>
          ))}
        </div>
      ))}
    </>
  )
}

export function MarketDetailsLink({ contract }: { contract: Contract }) {
  return (
    <a
      className={styles.chartLink}
      href={contractPath(contract)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Read description and comments: ${contract.question} (opens in a new tab)`}
    >
      chart →
    </a>
  )
}

// Copies a link that reopens this tab and race (with the sharer's referral).
export function CopyRaceLink(props: {
  mode: ExplorerMode
  race: string
  title: string
}) {
  const { mode, race, title } = props
  const user = useUser()
  return (
    <button
      aria-label={`Copy link to ${title}`}
      title="Copy link to this race"
      onClick={() => {
        const url = `https://${ENV_CONFIG.domain}/election${explorerSearch(
          user?.username ? referralQuery(user.username) : '',
          mode,
          race
        )}`
        copyToClipboard(url)
        toast.success('Link copied!')
        trackShareEvent('share election race', url)
      }}
    >
      <LinkIcon aria-hidden />
    </button>
  )
}

// What a candidate bet means stays visible. Sources whose rules leave cases
// open get one line in a closed "About this market" disclosure; confirmed
// sources show nothing. Audit caveats are internal notes and never render.
export function SourceNotes({ contract }: { contract: Contract }) {
  const { bet, unspecifiedRules } = sourceNotes(contract)
  return (
    <>
      {bet && <p className={styles.note}>{bet}</p>}
      {unspecifiedRules && (
        <details className={styles.marketInfo}>
          <summary>
            <span aria-hidden>ⓘ</span> About this market
          </summary>
          <p>
            {UNSPECIFIED_RULES}{' '}
            <a
              href={contractPath(contract)}
              target="_blank"
              rel="noopener noreferrer"
            >
              See the market page for its exact criteria →
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
        </details>
      )}
    </>
  )
}
