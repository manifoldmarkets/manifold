import clsx from 'clsx'
import { getOracleAttribution } from 'common/perps/oracle-attribution'

// Source credit for the oracle feed, rendered as a chart footnote.
//
// Deliberately a component rather than prose in the market description: some
// of these feeds are used under licences that require attribution, so it has
// to be something an edit to the description cannot remove. Anything that
// must always be there shouldn't live in a free-text field.

export const PerpOracleAttribution = (props: {
  feedId: string | undefined
  /** Provider-declared source timestamp, not SAGE's observation time. */
  asOfTime?: number | null
  className?: string
}) => {
  const { feedId, asOfTime, className } = props
  const attribution = getOracleAttribution(feedId)
  // An unregistered or brand-new feed renders nothing rather than "Source:
  // undefined".
  if (!attribution) return null

  const { source, url, licence, licenceUrl, showAsOf } = attribution
  const validAsOfTime =
    typeof asOfTime === 'number' && Number.isFinite(asOfTime) && asOfTime > 0
      ? asOfTime
      : null

  return (
    <div className={clsx('text-ink-400 text-xs', className)}>
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
      {licence &&
        (licenceUrl ? (
          <>
            {' ('}
            <a
              href={licenceUrl}
              target="_blank"
              rel="noopener noreferrer license"
              className="hover:text-ink-600 underline underline-offset-2"
            >
              {licence}
            </a>
            {')'}
          </>
        ) : (
          ` (${licence})`
        ))}
      {showAsOf &&
        (validAsOfTime == null
          ? ', source as-of unavailable.'
          : `, as of ${new Date(validAsOfTime).toISOString()}.`)}
    </div>
  )
}
