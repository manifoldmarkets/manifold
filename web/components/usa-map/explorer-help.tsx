import clsx from 'clsx'
import { Modal } from 'web/components/layout/modal'
import { OTHER_COLOR } from './election-map-model'
import styles from './election-explorer.module.css'
import interactions from '../us-elections/election-interactions.module.css'

// "How to read the map": three short points first, the methodology after.
export function ExplorerHelp(props: {
  open: boolean
  setOpen: (open: boolean) => void
  measures: boolean
}) {
  const { open, setOpen, measures } = props
  return (
    <Modal open={open} setOpen={setOpen} ariaLabel="How to read the map">
      <div className={clsx(styles.sources, interactions.scope)}>
        <h2>How to read the map</h2>
        {measures ? <MeasuresHelp /> : <RacesHelp />}
        <p className={styles.sourceCredit}>
          Map geometry and cartogram layout adapted from Theo Jaffee’s MTS
          midterms map (
          <a
            href="https://drops.mts.now/midterms/"
            target="_blank"
            rel="noreferrer"
          >
            drops.mts.now/midterms
          </a>
          , September 24, 2026 dataset).
        </p>
        <button className={styles.dismiss} onClick={() => setOpen(false)}>
          Got it
        </button>
      </div>
    </Modal>
  )
}

function RacesHelp() {
  return (
    <>
      <ul className={styles.helpPoints}>
        <li>
          <i className={styles.helpRamp} aria-hidden />
          <span>
            <b>Color is each party’s chance of winning</b> on Manifold, not vote
            share. Darker means a stronger favorite;{' '}
            <i
              className={styles.helpSwatch}
              style={{ background: OTHER_COLOR }}
              aria-hidden
            />{' '}
            teal means an independent or other candidate leads.
          </span>
        </li>
        <li>
          <i className={clsx(styles.helpSwatch, styles.hatchSwatch)} />
          <span>
            <b>Light diagonal hatching: no party odds yet.</b> Faint colored
            crosshatching{' '}
            <i
              className={clsx(styles.helpSwatch, styles.noRaceSwatch)}
              aria-hidden
            />{' '}
            marks seats not on the 2026 ballot and shows the party that holds
            them now.
          </span>
        </li>
        <li>
          <i className={styles.helpStep} aria-hidden>
            ✓
          </i>
          <span>
            <b>Select a race, then Bet</b> on the party you think will win. Bets
            use mana, Manifold’s play money. Each race links to its market for
            the full rules and comments.
          </span>
        </li>
      </ul>
      <details className={styles.methodology}>
        <summary>Methodology</summary>
        <p>
          Seat bars count each race once for the outcome that leads it. Safe:
          90% or higher. Likely: 75–89%. Lean: 60–74%. Toss-up: neither side
          reaches 60%; races that read the same for both sides are shown as
          even. Select a segment to list its races.
        </p>
        <p>
          A gray “Any other winner” is the No side of a single-party question
          (“Will a Democrat win?”). It counts as the other major party when that
          party has a nominee on the ballot, and separately otherwise.
          Probability on unknown or withdrawn candidates is not counted as an
          independent win.
        </p>
        <p>
          The Senate bar includes the 65 seats not on the ballot (34 Democratic
          caucus, 31 Republican), hatched at each end. Republicans control a
          50–50 Senate through the Vice President’s tie-breaking vote. Ten House
          seats have only one party on the ballot: nine California contests
          between two candidates of the same party, and Florida’s 10th district,
          where the only candidate is unopposed. They count for that party;
          candidate bets are still available.
        </p>
        <p>
          House odds combine a curated competitive-district market with reviewed
          state-wide district and individual race markets. Districts without a
          linked market show “no party odds yet”, including safe seats; that
          does not mean there is no market anywhere on Manifold. Chamber-control
          odds come from their own markets, not from these seat counts.
        </p>
        <p>
          Candidate markets price the people listed. Their party colors come
          from an audit of each answer; check the market for how replacement
          candidates or unlisted winners are handled. Answers under 1% that are
          not on the certified ballot are folded away.
        </p>
        <p>
          Officeholders were checked on October 3, 2026 against the{' '}
          <a
            href="https://clerk.house.gov/xml/lists/MemberData.xml"
            target="_blank"
            rel="noopener noreferrer"
          >
            House Clerk
          </a>
          ,{' '}
          <a
            href="https://www.senate.gov/senators/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Senate
          </a>{' '}
          and{' '}
          <a
            href="https://www.nga.org/governors/"
            target="_blank"
            rel="noopener noreferrer"
          >
            National Governors Association
          </a>
          . House incumbents refer to current district numbers in the 119th
          Congress; 2026 boundaries may differ. Incumbents are not necessarily
          running again.
        </p>
        <p>
          District boundaries reflect a September 24, 2026 snapshot based on
          Census geography and redistricting research. Missouri uses its 2022
          map pending litigation.
        </p>
        <p>
          Prices update live. Community markets may be thinly traded, and an
          unchanged price is not a new forecast. Outcomes are normalized within
          each race for map colors.
        </p>
      </details>
    </>
  )
}

function MeasuresHelp() {
  return (
    <>
      <ul className={styles.helpPoints}>
        <li>
          <i className={styles.helpMeasures} aria-hidden />
          <span>
            <b>Shading counts statewide questions</b> on the November 3, 2026
            ballot. It does not combine the odds of unrelated measures.
          </span>
        </li>
        <li>
          <i className={styles.helpStep} aria-hidden>
            %
          </i>
          <span>
            <b>Each measure has its own odds of passing.</b> A repeal question
            passes when voters approve the repeal.
          </span>
        </li>
        <li>
          <i className={styles.helpStep} aria-hidden>
            ✓
          </i>
          <span>
            <b>Select a state, then Pass or Fail</b> on any measure. Bets use
            mana, Manifold’s play money.
          </span>
        </li>
      </ul>
      <details className={styles.methodology}>
        <summary>Methodology</summary>
        <p>
          Portfolio questions are traded independently; their probabilities do
          not need to add to 100%.
        </p>
        <p>
          Ballot identities and market criteria were audited on October 3.
          Conditional sources carry a criteria note. Questions without a
          suitable market have no odds; uncertain identities stay under review.
          Official voter information and each market’s own rules are linked in
          its card.
        </p>
      </details>
    </>
  )
}
