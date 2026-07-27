import { getOracleAttribution } from 'common/perps/oracle-attribution'

// Source credit for the oracle feed, rendered as a chart footnote.
//
// Deliberately a component rather than prose in the market description: some
// of these feeds are used under licences that require attribution, so it has
// to be something an edit to the description cannot remove. Anything that
// must always be there shouldn't live in a free-text field.

// Deterministic UTC — toLocaleString would disagree between the server render
// and the client's timezone and break hydration.
const formatUtc = (ts: number) => {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`
  )
}

export const PerpOracleAttribution = (props: {
  feedId: string | undefined
  /** ts of the latest oracle point, for feeds whose terms want an as-of. */
  asOfTime?: number
}) => {
  const { feedId, asOfTime } = props
  const attribution = getOracleAttribution(feedId)
  // An unregistered or brand-new feed renders nothing rather than "Source:
  // undefined".
  if (!attribution) return null

  const { source, url, licence, showAsOf } = attribution

  return (
    <div className="text-ink-400 text-xs">
      Source:{' '}
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-ink-600 underline underline-offset-2"
        >
          {source}
        </a>
      ) : (
        source
      )}
      {licence && ` (${licence})`}
      {showAsOf && asOfTime ? ` · as of ${formatUtc(asOfTime)}` : ''}
    </div>
  )
}
