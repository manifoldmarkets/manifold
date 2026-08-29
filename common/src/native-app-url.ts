// Origin parsing for the native app's credential hand-off.
//
// WHY NOT THE GLOBAL URL. The native app's index.js imports 'expo' before
// './App', and expo/src/winter/runtime.native.ts installs URL from
// whatwg-url-without-unicode over React Native's own polyfill — so the runtime
// URL is spec-compliant in almost every respect. It throws on garbage, strips
// userinfo from origin, and drops a default port. Two things it does NOT do,
// because that package exists to omit the IDNA tables:
//
//   new URL('https://PREVIEW.VERCEL.APP/').origin -> 'https://PREVIEW.VERCEL.APP'
//   new URL('https://mänifold.markets/').origin   -> 'https://mänifold.markets'
//
// (Verified against whatwg-url-without-unicode@8.0.0-3; Node's WHATWG URL gives
// 'https://preview.vercel.app' and 'https://xn--mnifold-5wa.markets'.)
//
// A WebView document is a real browser, so the location.origin it reports is
// always lowercase ASCII. Comparing that against an origin the runtime URL left
// mixed-case would never match, and the hand-off would be stranded for good —
// silently and permanently. So origins are parsed and canonicalized here
// instead. Everything is pure and string-only, because CI has no way to run
// anything in the native package.
//
// The bar for accepting an origin is therefore: it must serialize exactly the
// way a browser would. Where matching a browser takes real work — compressing an
// IPv6 address per RFC 5952, or expanding shorthand IPv4 like '127.1' — this
// rejects the input rather than store an origin no document will ever report.
// native-app-url.test.ts asserts that invariant for every accepted case, using
// Node's WHATWG URL as the browser oracle.

const DEFAULT_PORTS: Record<string, string> = { 'http:': '80', 'https:': '443' }

// A single ASCII DNS label: alphanumeric, inner hyphens allowed.
const LABEL = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?'
const HOSTNAME_RE = new RegExp(`^${LABEL}(?:\\.${LABEL})*$`)

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

const ipv4Octets = (hostname: string): number[] | null => {
  const parts = hostname.split('.')
  if (parts.length !== 4) return null
  const octets: number[] = []
  for (const part of parts) {
    // No leading zeros: a browser reads '010' as octal, so '010.000.000.001'
    // serializes to 8.0.0.1. Refuse the ambiguity rather than reimplement it.
    if (!/^(?:0|[1-9][0-9]{0,2})$/.test(part)) return null
    const value = Number(part)
    if (value > 255) return null
    octets.push(value)
  }
  return octets
}

// Per the URL spec a domain whose last label is all digits must parse as an IPv4
// address, so anything that looks numeric has to already BE the canonical dotted
// quad. This rejects '127.1' (browser: 127.0.0.1), '2130706433' (127.0.0.1),
// '0x7f.0.0.1' (127.0.0.1) and '010.000.000.001' (8.0.0.1).
const looksNumeric = (hostname: string) => /(?:^|\.)[0-9]+$/.test(hostname)

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
 * null. Accepts only what serializes identically in a browser: ASCII hostnames,
 * canonical dotted-quad IPv4, and '[::1]'. Rejects userinfo, non-ASCII hosts,
 * malformed ports and every non-http(s) scheme.
 */
export const parseHttpOrigin = (raw: unknown): ParsedOrigin | null => {
  if (typeof raw !== 'string') return null
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

  // Userinfo before the host is never acceptable here — it is exactly how a
  // hostile url is dressed to read as ours: 'https://manifold.markets@evil.com'.
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

  if (hostname.startsWith('[')) {
    // Loopback only. A browser compresses IPv6 per RFC 5952, so
    // '[0:0:0:0:0:0:0:1]' comes back as '[::1]' and a stored expanded form would
    // never match, while '[:::]' and '[1::2::3]' are rejected outright there.
    // Rather than reimplement either behaviour for an address nothing needs,
    // take the one form that is already canonical.
    if (hostname !== '[::1]') return null
  } else {
    // ASCII only. A non-ASCII host needs IDNA to canonicalize, which the app's
    // runtime URL deliberately cannot do — a punycoded 'xn--' host is already
    // ASCII and passes.
    if (!HOSTNAME_RE.test(hostname)) return null
    if (looksNumeric(hostname) && ipv4Octets(hostname) === null) return null
  }

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
