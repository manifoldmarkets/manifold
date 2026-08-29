// Origin parsing for the native app's credential hand-off.
//
// This deliberately does NOT use the global URL. React Native 0.81 polyfills URL
// from Libraries/Blob/URL.js, which is a set of regexes rather than a WHATWG
// parser, and three of its behaviours are actively unsafe to base a trust
// decision on:
//   - the single-argument constructor NEVER throws, so `new URL('not a url')`
//     succeeds and a try/catch around it is dead code;
//   - `origin` is `_url.match(/^(https?:\/\/[^/]+)/)`, so it keeps any userinfo:
//     'https://manifold.markets@evil.com/' yields origin
//     'https://manifold.markets@evil.com';
//   - nothing is lowercased, so 'https://PREVIEW.VERCEL.APP' compares unequal to
//     the lowercase origin the WebView document reports for itself.
// Everything here is pure and string-only so it can be tested in CI, which the
// native package has no runner for.

const DEFAULT_PORTS: Record<string, string> = { 'http:': '80', 'https:': '443' }

// A single ASCII DNS label: alphanumeric, inner hyphens allowed.
const LABEL = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?'
const HOSTNAME_RE = new RegExp(`^${LABEL}(?:\\.${LABEL})*$`)
// Bracketed IPv6, e.g. [::1]. Only hex, colons and a dotted IPv4 tail.
const IPV6_RE = /^\[[0-9a-f:.]+\]$/

// Splits scheme + authority off the front. Authority runs to the first /, ? or #.
const SCHEME_AUTHORITY_RE = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([\s\S]*)$/i

type ParsedOrigin = {
  /** Canonical, comparable against a browser's location.origin. */
  origin: string
  /** Lowercased host with no port. '[::1]' keeps its brackets. */
  hostname: string
  /** 'http:' or 'https:'. */
  protocol: string
  /** Everything after the authority: path + query + fragment. */
  rest: string
}

const parsePort = (raw: string, protocol: string): string | null => {
  if (raw === '') return ''
  // No leading zeros, no '+', no whitespace — Number() is far too forgiving.
  if (!/^[0-9]{1,5}$/.test(raw)) return null
  const port = Number(raw)
  if (port < 1 || port > 65535) return null
  // A browser's origin omits the scheme's default port; match that or the
  // comparison against location.origin fails for an explicit :443.
  return String(port) === DEFAULT_PORTS[protocol] ? '' : String(port)
}

/**
 * Strictly parses an absolute http(s) URL into a canonical origin, or returns
 * null. Rejects userinfo, non-ASCII hosts, malformed ports and every non-http(s)
 * scheme (javascript:, data:, file:, blob:, about:).
 */
export const parseHttpOrigin = (raw: unknown): ParsedOrigin | null => {
  if (typeof raw !== 'string') return null
  // Leading/trailing whitespace and C0 controls are stripped by real parsers;
  // anything else non-printable means it isn't a URL a human typed.
  const trimmed = raw.trim()
  if (trimmed === '') return null
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i)
    // C0 controls and DEL. Written as a scan because a control-character
    // class in a regex literal trips no-control-regex.
    if (code <= 0x1f || code === 0x7f) return null
  }

  const match = SCHEME_AUTHORITY_RE.exec(trimmed)
  if (!match) return null
  const [, rawScheme, authority, rest] = match

  const protocol = rawScheme.toLowerCase() + ':'
  if (protocol !== 'http:' && protocol !== 'https:') return null

  // Userinfo is never acceptable here: RN's URL.origin keeps it while its
  // hostname getter strips it, so the two disagree about who the host is.
  if (authority.includes('@')) return null

  let hostPart = authority
  let portPart = ''
  if (authority.startsWith('[')) {
    const close = authority.indexOf(']')
    if (close === -1) return null
    hostPart = authority.slice(0, close + 1)
    const tail = authority.slice(close + 1)
    if (tail !== '') {
      if (!tail.startsWith(':')) return null
      portPart = tail.slice(1)
    }
  } else {
    const colon = authority.indexOf(':')
    if (colon !== -1) {
      hostPart = authority.slice(0, colon)
      portPart = authority.slice(colon + 1)
    }
  }

  const hostname = hostPart.toLowerCase()
  if (hostname === '') return null
  // ASCII only. A non-ASCII host would need IDNA to canonicalize, which nothing
  // in this path can do — a punycoded 'xn--' host is already ASCII and passes.
  if (!HOSTNAME_RE.test(hostname) && !IPV6_RE.test(hostname)) return null

  const port = parsePort(portPart, protocol)
  if (port === null) return null

  return {
    origin: `${protocol}//${hostname}${port ? `:${port}` : ''}`,
    hostname,
    protocol,
    rest,
  }
}

/** Canonical origin string, or null. */
export const originOf = (raw: unknown): string | null =>
  parseHttpOrigin(raw)?.origin ?? null

/** True when both parse and share an origin. Two unparseable urls are NOT equal. */
export const isSameOrigin = (a: unknown, b: unknown): boolean => {
  const originA = originOf(a)
  return originA !== null && originA === originOf(b)
}

const ipv4Octets = (hostname: string): number[] | null => {
  const parts = hostname.split('.')
  if (parts.length !== 4) return null
  const octets: number[] = []
  for (const part of parts) {
    // No leading zeros: '010.0.0.1' is octal to some resolvers and decimal to
    // others, so it has no single correct reading.
    if (!/^(?:0|[1-9][0-9]{0,2})$/.test(part)) return null
    const value = Number(part)
    if (value > 255) return null
    octets.push(value)
  }
  return octets
}

/**
 * Loopback or RFC1918 only — the sole hosts allowed to hold credentials over
 * plain http. Requires a COMPLETE numeric IPv4 address: a prefix test alone
 * would accept public names like '10.attacker.example'.
 */
export const isLocalHostname = (hostname: string): boolean => {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const octets = ipv4Octets(hostname)
  if (!octets) return false
  const [a, b] = octets
  if (a === 127) return true
  if (a === 10) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  return false
}

export type SwitchableAppUrl = {
  /** Canonical origin, shown to the admin for confirmation. */
  origin: string
  /** What baseUri becomes. Always origin + '/', because callers concatenate. */
  base: string
  /** Where to navigate first, preserving any path the admin typed. */
  href: string
}

/**
 * Validates a 'Native url' before it may become the app's base — and therefore
 * the origin the credential hand-off trusts. https anywhere; plain http only for
 * localhost / RFC1918.
 */
export const parseSwitchableAppUrl = (
  raw: unknown
): SwitchableAppUrl | null => {
  const parsed = parseHttpOrigin(raw)
  if (!parsed) return null
  if (parsed.protocol === 'http:' && !isLocalHostname(parsed.hostname))
    return null
  // baseUri is concatenated with an endpoint ('home', 'notifications', ...), so
  // it has to be the bare origin with a trailing slash. Keeping a typed path
  // here is what produced urls like '/foohome'.
  return {
    origin: parsed.origin,
    base: `${parsed.origin}/`,
    href: parsed.origin + (parsed.rest || '/'),
  }
}
