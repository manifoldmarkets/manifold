import clsx from 'clsx'
import { getMnxInstrument } from 'common/perps/mnx'
import { MnxLinkLocation } from 'common/perps/mnx-cta'
import { getOracleAttribution } from 'common/perps/oracle-attribution'
import { mnxLinkProps } from './mnx-cta'

// Source credit for the oracle feed, rendered as a chart footnote.
//
// Deliberately a component rather than prose in the market description: some
// of these feeds are used under licences that require attribution, so it has
// to be something an edit to the description cannot remove. Anything that
// must always be there shouldn't live in a free-text field.

export const PerpOracleAttribution = (props: {
  feedId: string | undefined
  /** Provider-declared source timestamp, not Manifold's observation time. */
  asOfTime?: number | null
  /**
   * Count clicks on an MNX credit as coming from this placement. Optional
   * because this line is a credit first — a placement that doesn't care where
   * its clicks came from renders the plain link it always did — but every
   * placement that sits next to a CTA should pass it, or the CTA's numbers
   * look better than the page's.
   */
  mnxLinkLocation?: MnxLinkLocation
  /** Groups those clicks by market. Only read alongside mnxLinkLocation. */
  contractId?: string
  className?: string
}) => {
  const { feedId, asOfTime, mnxLinkLocation, contractId, className } = props
  const attribution = getOracleAttribution(feedId)
  // An unregistered or brand-new feed renders nothing rather than "Source:
  // undefined".
  if (!attribution) return null

  const { source, url, licence, licenceUrl, showAsOf } = attribution
  const validAsOfTime =
    typeof asOfTime === 'number' && Number.isFinite(asOfTime) && asOfTime > 0
      ? asOfTime
      : null
  // The credit used to double as the only route to MNX ("Trade with real money
  // on MNX"), because there was no CTA. There is one now, so this goes back to
  // reading as what it is — a credit — and the selling happens in MnxTradeCta.
  // The href is still tagged and counted, since a reader who clicks the credit
  // line left for MNX just the same.
  const trackedMnxLink =
    url && mnxLinkLocation && getMnxInstrument(feedId)
      ? mnxLinkProps({
          url,
          location: mnxLinkLocation,
          feedId,
          contractId,
        })
      : undefined

  return (
    <div className={clsx('text-ink-400 text-xs', className)}>
      Source:{' '}
      {url ? (
        <a
          {...(trackedMnxLink ?? {
            href: url,
            target: '_blank',
            rel: 'noopener noreferrer',
          })}
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
