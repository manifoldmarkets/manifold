import { usePersistentInMemoryState } from 'client-common/hooks/use-persistent-in-memory-state'
import { Contract } from 'common/contract'
import { formatOdds } from 'web/components/usa-map/election-display'
import {
  Bucket,
  otherNominee,
  sideTotal,
} from 'web/lib/politics/election-glance'
import { OddsStrip, StripFlip } from './odds-strip'

// How many seats each party holds after an election, one strip per chamber
// (the "How many Senate seats will Democrats hold" and "How many House seats
// will Democrats win" markets). Both count the Democrats'; one toggle, on the
// first strip, reads both from the Republicans' side instead (100 or 435
// minus each range). A 50–50 Senate is neither party's: grey, with the line
// at 51.

export function SeatStrips(props: {
  senate?: Contract
  house?: Contract
  year: number
}) {
  const { senate, house, year } = props
  // One reading for both strips; the toggle sits on the first of them.
  const [flipped, setFlipped] = usePersistentInMemoryState(
    false,
    `election-seat-strips-flip-${year}`
  )
  if (!senate && !house) return null
  return (
    <div className="bg-canvas-0 border-ink-200 flex flex-col gap-5 rounded-xl border p-4">
      {senate && (
        <OddsStrip
          contract={senate}
          title={`Democratic Senate seats after ${year}`}
          threshold={51}
          tie={50}
          thresholdLabel="51+"
          summary={(b) => <SenateSummary buckets={b} />}
          flip={senateFlip(year)}
          flipped={flipped}
          onFlip={setFlipped}
        />
      )}
      {house && (
        <OddsStrip
          contract={house}
          title={`Democratic House seats won in ${year}`}
          threshold={218}
          thresholdLabel="218+"
          summary={(b) => <HouseSummary buckets={b} />}
          flip={houseFlip(year)}
          flipped={flipped}
          onFlip={senate ? undefined : setFlipped}
        />
      )}
    </div>
  )
}

function SenateSummary(props: { buckets: Bucket[] }) {
  const { buckets } = props
  const majority = buckets[buckets.length - 1]?.side
  const tie = sideTotal(buckets, 'tie')
  return (
    <>
      51 or more:{' '}
      <b className="text-ink-1000">
        {formatOdds(majority === 'tie' ? 0 : sideTotal(buckets, majority))}
      </b>
      {tie > 0 && (
        <>
          {' '}
          · 50–50, the Vice President&apos;s party:{' '}
          <b className="text-ink-1000">{formatOdds(tie)}</b>
        </>
      )}
    </>
  )
}

function HouseSummary(props: { buckets: Bucket[] }) {
  const { buckets } = props
  const majority = buckets[buckets.length - 1]?.side
  return (
    <>
      218 or more (a majority):{' '}
      <b className="text-ink-1000">
        {formatOdds(majority === 'tie' ? 0 : sideTotal(buckets, majority))}
      </b>
    </>
  )
}

const TOGGLE: [string, string] = ['Democrats', 'Republicans']

const senateFlip = (year: number): StripFlip => ({
  toggle: TOGGLE,
  toggleLabel: 'Whose seats',
  title: `Republican Senate seats after ${year}`,
  thresholdLabel: '51+',
  buckets: (b) => otherNominee(b, 100, 51, 50),
  summary: (b) => <SenateSummary buckets={b} />,
  footnote:
    '100 minus the Democrats’ (with the independents who caucus with them), from the same market, assuming every senator caucuses with one of the two parties.',
  note: (shown, answer) =>
    `Republicans holding ${shown.text} seats is the same outcome as Democrats holding ${answer.text}, so this bets on that answer.`,
})

const houseFlip = (year: number): StripFlip => ({
  toggle: TOGGLE,
  toggleLabel: 'Whose seats',
  title: `Republican House seats won in ${year}`,
  thresholdLabel: '218+',
  buckets: (b) => otherNominee(b, 435, 218),
  summary: (b) => <HouseSummary buckets={b} />,
  footnote:
    '435 minus the Democrats’, from the same market, assuming every seat goes to one of the two parties.',
  note: (shown, answer) =>
    `Republicans winning ${shown.text} seats is the same outcome as Democrats winning ${answer.text}, so this bets on that answer.`,
})
