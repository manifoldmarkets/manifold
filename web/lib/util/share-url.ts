// Query parameters that describe how the *current* visitor arrived, not what
// they are looking at. A shared link should not pass them on: an incoming
// referral would credit someone else's sign-ups, and campaign tags would
// misattribute the sharer's traffic.
const ARRIVAL_PARAMS = ['r', 'referrer', 'fbclid', 'gclid', 'twclid']
const isArrivalParam = (key: string) =>
  ARRIVAL_PARAMS.includes(key) || key.startsWith('utm_')

/**
 * The link a Share button should copy for the page being viewed: the current
 * path and query (so deep links such as `?office=senate&race=ME` survive),
 * minus arrival-only parameters, plus the sharer's own referral query when
 * they are signed in (`referralQuery(username)`, e.g. `?r=...`).
 *
 * Parameters are re-encoded with URLSearchParams, so a base64 referral that
 * contains `+` is sent as `%2B` and reads back intact with
 * `searchParams.get('r')` (a raw `+` would decode to a space).
 */
export function buildShareUrl(props: {
  domain: string
  pathname: string
  search: string
  referralQuery?: string
}): string {
  const { domain, pathname, search, referralQuery } = props
  const params = new URLSearchParams(search)
  const keys: string[] = []
  params.forEach((_, key) => keys.push(key))
  keys.filter(isArrivalParam).forEach((key) => params.delete(key))
  if (referralQuery) {
    // referralQuery builds its value unencoded ("?r=<base64>"), so split it by
    // hand: URLSearchParams would read a "+" in the value as a space.
    const [key, ...value] = referralQuery.replace(/^\?/, '').split('=')
    if (key) params.set(key, value.join('='))
  }
  const query = params.toString()
  return `https://${domain}${pathname}${query ? `?${query}` : ''}`
}
