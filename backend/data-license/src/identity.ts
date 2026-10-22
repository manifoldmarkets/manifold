// ---------------------------------------------------------------------------
// identity.ts — usernames that travel inside strings.
//
// scope.ts strips the denormalized identity fields (creatorUsername, userName,
// …), but a username also rides inside strings that no field list reaches:
//   - storage paths: contract-images/<username>/…, user-images/<username>/…
//     (cover images, pasted images; percent-encoded inside Firebase URLs)
//   - links: manifold.markets/<username>/<slug>, /embed/<username>/<slug>,
//     /api/v0/user/<username>, a bare profile link manifold.markets/<username>
//   - site-relative paths: a contract mention's label is "/<username>/<slug>"
//     (common/contract.ts contractPath), and so are relative hrefs and
//     markdown links ](/<username>/<slug>)
//   - link-preview URLs: …/api/og/market?…&creatorName=…&creatorAvatarUrl=…
//   - referral params: ?r=<base64 username> (common/util/share.ts), ?referrer=
//   - a handle typed as a plain word in prose
// A cover image's path alone names the market's creator. Pseudonyms are stable
// across tables, so one named row re-identifies that user's trades and
// comments everywhere.
//
// Rewrites keep joins: a username becomes its owner's pseudonym, so a link
// still says whose market it points at. A username we can't tie to a user id
// (renamed before any surviving record, ambiguous, or never existed) becomes
// the unknown placeholder. Slugs are kept.
//
// findIdentityLeaks is the validator's side of the same rules. It fully
// decodes each string first (percent escapes at any depth, HTML entities,
// JSON-escaped slashes), so a shape the rewriter can't parse still counts as a
// leak.
// ---------------------------------------------------------------------------

import { RESERVED_PATHS } from 'common/envs/constants'
import { Pseudonymizer } from './pseudonymize'
import {
  MANIFOLD_EMBED_ROUTES,
  MANIFOLD_PAGE_ROUTES,
  STORAGE_SHARED_SEGMENTS,
  STORAGE_USER_PREFIXES,
  TableName,
} from './scope'

// A user id, or null when two different users share the name.
type Owner = string | null

export interface NameRecord {
  id: string | null
  username?: string | null
  name?: string | null
}

/**
 * A word that is distinctive enough to be a handle: 5+ characters from the
 * username alphabet, not just digits and dashes, with a digit, an underscore or
 * an internal capital ("Zorvex42", "quill_ardent", "BrambleMoth"). Ordinary words and
 * most public names fail this, so they are never rewritten.
 */
export function isHandleLike(word: string): boolean {
  return (
    word.length >= 5 &&
    /^[A-Za-z0-9_-]+$/.test(word) &&
    !/^[\d_-]+$/.test(word) &&
    (/[\d_]/.test(word) || /[a-z][A-Z]/.test(word))
  )
}

export class NameIndex {
  // lowercased username, current or historical -> owner
  readonly usernames = new Map<string, Owner>()
  // lowercased handle-like username or one-word display name -> owner: the
  // candidates for the bare-word rule
  readonly handles = new Map<string, Owner>()
  // lowercased display name, any shape -> every user who has had it: only
  // ever matched right before one of those users' @handle
  // (see rewriteNameHandlePairs), so a shared name still pairs
  readonly displayNames = new Map<string, Set<string>>()
  // rows of delivered prose each handle appears in (see countProseRow)
  private readonly rowFreq = new Map<string, number>()
  private maxRareRows = -1 // < 0: rarity not computed, nothing is rare

  static fromRecords(records: Iterable<NameRecord>): NameIndex {
    const idx = new NameIndex()
    for (const r of records) {
      if (!r.id) continue
      const username = r.username?.trim()
      if (username) {
        add(idx.usernames, username.toLowerCase(), r.id)
        if (isHandleLike(username))
          add(idx.handles, username.toLowerCase(), r.id)
      }
      const name = r.name?.trim().replace(/\s+/g, ' ')
      if (name && isHandleLike(name)) add(idx.handles, name.toLowerCase(), r.id)
      if (name) {
        const owners = idx.displayNames.get(name.toLowerCase()) ?? new Set()
        idx.displayNames.set(name.toLowerCase(), owners.add(r.id))
      }
    }
    return idx
  }

  /** Tally one delivered prose row (a market, comment or answer). */
  countProseRow(words: Set<string>): void {
    for (const w of words) this.rowFreq.set(w, (this.rowFreq.get(w) ?? 0) + 1)
  }

  /** Handles in at most maxRows prose rows count as rare from now on. */
  setRareThreshold(maxRows: number): void {
    this.maxRareRows = maxRows
  }

  isRare(lower: string): boolean {
    return (
      this.maxRareRows >= 0 &&
      this.handles.has(lower) &&
      (this.rowFreq.get(lower) ?? 0) <= this.maxRareRows
    )
  }

  get rareCount(): number {
    let n = 0
    for (const k of this.handles.keys()) if (this.isRare(k)) n++
    return n
  }
}

function add(map: Map<string, Owner>, key: string, id: string): void {
  const prev = map.get(key)
  if (prev === undefined) map.set(key, id)
  else if (prev !== id) map.set(key, null)
}

export interface IdentityCounts {
  storagePathsRewritten: number
  // user segments of links and relative paths, and identity query values
  linkUsernamesRewritten: number
  // path segments and words rewritten to the unknown placeholder
  usernamesUnresolved: number
  previewParamsStripped: number
  referralParamsStripped: number
  bareUsernamesReplaced: number
  // "Ostrander Quill (@OstranderQuill42)": display name + own handle, both replaced
  nameHandlePairsReplaced: number
  // @handles of Manifold users in market descriptions (SCRUB_DESCRIPTIONS)
  descriptionHandlesRewritten: number
  // market slugs containing a rare handle; slugs are kept, so counted only
  slugsWithRareHandle: number
}

export function newIdentityCounts(): IdentityCounts {
  return {
    storagePathsRewritten: 0,
    linkUsernamesRewritten: 0,
    usernamesUnresolved: 0,
    previewParamsStripped: 0,
    referralParamsStripped: 0,
    bareUsernamesReplaced: 0,
    nameHandlePairsReplaced: 0,
    descriptionHandlesRewritten: 0,
    slugsWithRareHandle: 0,
  }
}

export interface IdentityContext {
  ps: Pseudonymizer
  names: NameIndex
  knownUserIds: Set<string>
  counts: IdentityCounts
}

// --- shared parsing --------------------------------------------------------

const ROUTES = new Set(
  [...RESERVED_PATHS, ...MANIFOLD_PAGE_ROUTES].map((r) => r.toLowerCase())
)
const EMBED_ROUTES = new Set(MANIFOLD_EMBED_ROUTES)
const SHARED_SEGMENTS = new Set(STORAGE_SHARED_SEGMENTS)
const PREVIEW_PARAMS = new Set([
  'creatorName',
  'creatorUsername',
  'creatorAvatarUrl',
])
const REFERRAL_PARAMS = new Set(['r', 'referrer'])
const PREVIEW_PARAM_RE = /creator(?:Name|Username|AvatarUrl)/i

// Cheap gate: most strings (ids, enums, prose without links) skip all parsing.
const MARKERS_RE =
  /manifold\.markets|-images(?:\/|%(?:25)*2F)|creator(?:Name|Username|AvatarUrl)|\]\(\//i

// A path separator, raw or percent-encoded to any depth.
const SEP = '(?:\\/|%(?:25)*2F)'
// <prefix><sep><segment><sep>: the segment can't contain a separator
const STORAGE_RE = new RegExp(
  `(${STORAGE_USER_PREFIXES.join('|')})(${SEP})` +
    `((?:(?!%(?:25)*2F)[^/?#&\\s"'<>\\\\])+)(?=${SEP})`,
  'gi'
)
// A manifold.markets link with or without scheme or port, then a path, query
// or fragment. Not a subdomain (docs.manifold.markets) and not inside a longer
// host or word.
const MANIFOLD_LINK_RE =
  /(?<![A-Za-z0-9.@_-])((?:https?:\/\/)?(?:www\.|dev\.)?manifold\.markets(?::\d+)?)([/?#][^\s"'<>\\]*)?/gi
const ANY_URL_RE = /https?:\/\/[^\s"'<>\\]+/gi
// A whole string that is a site-relative path: a contract mention's label, a
// relative href.
const RELATIVE_PATH_RE = /^\/(?!\/)[^\s"'<>\\]*$/
// A markdown link to a site-relative path, inside text
const MD_RELATIVE_LINK_RE = /\]\((\/(?!\/)[^)\s]*)\)/g
const TRAILING_PUNCT_RE = /[.,;:!?)\]}'"]+$/

function percentDecode(s: string): string {
  return s.replace(/(?:%[0-9A-Fa-f]{2})+/g, (m) => {
    try {
      return decodeURIComponent(m)
    } catch {
      return m
    }
  })
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  sol: '/',
  quest: '?',
  equals: '=',
  num: '#',
  colon: ':',
  period: '.',
}

/** HTML entities and JSON-escaped slashes, as pasted HTML and JSON carry them. */
export function normalizeEscapes(s: string): string {
  if (!s.includes('&') && !s.includes('\\/')) return s
  return s
    .replace(/\\\//g, '/')
    .replace(
      /&(?:#(\d{1,6})|#x([0-9a-f]{1,6})|([a-z]+));/gi,
      (m, dec, hex, name) => {
        if (dec) return String.fromCodePoint(Number(dec))
        if (hex) return String.fromCodePoint(parseInt(hex, 16))
        return ENTITIES[name.toLowerCase()] ?? m
      }
    )
}

/** Percent-decode at any depth; malformed escapes stay. */
export function fullyDecode(s: string): string {
  let out = s
  for (let i = 0; i < 6 && out.includes('%'); i++) {
    const next = percentDecode(out)
    if (next === out) break
    out = next
  }
  return out
}

// Everything a scan needs undone: percent escapes, entities, escaped slashes,
// in any nesting order.
function decodeAll(s: string): string {
  let out = s
  for (let i = 0; i < 6; i++) {
    const next = fullyDecode(normalizeEscapes(out))
    if (next === out) break
    out = next
  }
  return out
}

function mayCarryIdentity(s: string): boolean {
  if (MARKERS_RE.test(s) || RELATIVE_PATH_RE.test(s)) return true
  return /%|&|\\\//.test(s) && MARKERS_RE.test(decodeAll(s))
}

function splitOnce(s: string, sep: string): [string, string | undefined] {
  const i = s.indexOf(sep)
  return i < 0 ? [s, undefined] : [s.slice(0, i), s.slice(i + sep.length)]
}

// The path segment that names a user, or -1, and whether that position can
// also hold a route. `segs` is path.split('/') so segs[0] is ''.
function userSegment(segs: string[]): {
  i: number
  routes: Set<string> | null
} {
  const first = (segs[1] ?? '').toLowerCase()
  if (first === 'embed') return { i: segs[2] ? 2 : -1, routes: EMBED_ROUTES }
  if (first === 'api') {
    const isUserApi =
      segs[2]?.toLowerCase() === 'v0' &&
      ['user', 'users'].includes(segs[3]?.toLowerCase() ?? '') &&
      !!segs[4] &&
      segs[4].toLowerCase() !== 'by-id'
    return { i: isUserApi ? 4 : -1, routes: null }
  }
  return { i: segs[1] ? 1 : -1, routes: ROUTES }
}

// What to do with a decoded user-position segment: its known owner, the
// placeholder for something shaped like a username we can't resolve, or null
// to leave it (a route, a file, our own output, not a username at all).
function classify(
  seg: string,
  routes: Set<string> | null,
  names: NameIndex,
  ps: Pseudonymizer
): { owner: Owner; known: boolean } | null {
  const lower = seg.toLowerCase()
  if (routes?.has(lower)) return null
  // a real username wins over the pseudonym shape
  if (names.usernames.has(lower))
    return { owner: names.usernames.get(lower) ?? null, known: true }
  if (
    ps.isPseudonym(seg) ||
    seg.length < 2 ||
    !/^[A-Za-z0-9_-]+$/.test(seg) ||
    /^\d+$/.test(seg)
  )
    return null
  return { owner: null, known: false }
}

// --- rewriting -------------------------------------------------------------

function replacementFor(
  owner: Owner | undefined,
  ctx: IdentityContext
): string {
  if (owner) return ctx.ps.map(owner)
  ctx.counts.usernamesUnresolved++
  return ctx.ps.unknown
}

// A username or user id from a path or param -> pseudonym or placeholder.
function resolve(seg: string, ctx: IdentityContext): string {
  if (ctx.knownUserIds.has(seg)) return ctx.ps.map(seg)
  return replacementFor(ctx.names.usernames.get(seg.toLowerCase()), ctx)
}

function rewriteStoragePaths(s: string, ctx: IdentityContext): string {
  return s.replace(
    STORAGE_RE,
    (m, prefix: string, sep: string, seg: string) => {
      const decoded = fullyDecode(seg)
      if (SHARED_SEGMENTS.has(decoded)) return m
      if (
        ctx.ps.isPseudonym(decoded) &&
        !ctx.names.usernames.has(decoded.toLowerCase())
      )
        return m
      ctx.counts.storagePathsRewritten++
      return prefix + sep + resolve(decoded, ctx)
    }
  )
}

function rewriteQuery(
  query: string,
  manifold: boolean,
  ctx: IdentityContext,
  depth: number
): string {
  const delim = query.includes('&amp;') ? '&amp;' : '&'
  const kept: string[] = []
  for (const pair of query.split(/&amp;|&/)) {
    const [rawKey, rawVal] = splitOnce(pair, '=')
    const key = fullyDecode(rawKey)
    if (PREVIEW_PARAMS.has(key)) {
      ctx.counts.previewParamsStripped++
      continue
    }
    if (manifold && REFERRAL_PARAMS.has(key)) {
      ctx.counts.referralParamsStripped++
      continue
    }
    const val = rawVal ? fullyDecode(rawVal) : ''
    const lower = val.toLowerCase()
    if (manifold && val && (key === 'username' || ctx.names.isRare(lower))) {
      if (!ctx.ps.isPseudonym(val) || ctx.names.usernames.has(lower)) {
        ctx.counts.linkUsernamesRewritten++
        const v = ctx.names.usernames.has(lower)
          ? resolve(val, ctx)
          : replacementFor(ctx.names.handles.get(lower), ctx)
        kept.push(`${rawKey}=${v}`)
        continue
      }
    }
    // A URL nested in a param (e.g. an image proxy's ?url=…) gets the same
    // treatment, re-encoded only if it arrived encoded.
    if (val && depth < 3 && mayCarryIdentity(val)) {
      const inner = rewriteUrls(val, ctx, depth + 1)
      if (inner !== val) {
        kept.push(
          `${rawKey}=${val === rawVal ? inner : encodeURIComponent(inner)}`
        )
        continue
      }
    }
    kept.push(pair)
  }
  return kept.join(delim)
}

// path?query#fragment -> rewritten, keeping everything else byte for byte
function rewriteTail(
  tail: string,
  manifold: boolean,
  ctx: IdentityContext,
  depth: number,
  relative = false
): string {
  const [beforeFrag, frag] = splitOnce(tail, '#')
  const [path, query] = splitOnce(beforeFrag, '?')
  let newPath = path
  if (manifold) {
    const segs = path.split('/')
    const { i, routes } = userSegment(segs)
    const seg = i > 0 ? fullyDecode(segs[i]) : ''
    const hit = i > 0 ? classify(seg, routes, ctx.names, ctx.ps) : null
    // A lone relative segment ("/jk") is too weak a signal to replace unless
    // it is a known username; "/<user>/<slug>" and absolute links are links.
    const weak = relative && segs.length === 2 && !hit?.known
    if (hit && !weak) {
      segs[i] = ctx.knownUserIds.has(seg)
        ? ctx.ps.map(seg)
        : replacementFor(hit.owner, ctx)
      ctx.counts.linkUsernamesRewritten++
      newPath = segs.join('/')
    }
  }
  let out = newPath
  if (query !== undefined) {
    const q = rewriteQuery(query, manifold, ctx, depth)
    if (q) out += '?' + q
  }
  if (frag !== undefined) out += '#' + frag
  return out
}

function stripTrailing(s: string): [string, string] {
  const trail = s.match(TRAILING_PUNCT_RE)?.[0] ?? ''
  return [trail ? s.slice(0, -trail.length) : s, trail]
}

function rewriteUrls(s: string, ctx: IdentityContext, depth: number): string {
  let out = s.replace(MANIFOLD_LINK_RE, (_m, host: string, rest?: string) => {
    if (!rest) return host
    const [core, trail] = stripTrailing(rest)
    return host + rewriteTail(core, true, ctx, depth) + trail
  })
  out = out.replace(
    MD_RELATIVE_LINK_RE,
    (_m, path: string) => '](' + rewriteTail(path, true, ctx, depth, true) + ')'
  )
  // Preview params ride on other hosts too (the old og-image service), and
  // their names may arrive percent-encoded.
  if (
    PREVIEW_PARAM_RE.test(out) ||
    (out.includes('%') && PREVIEW_PARAM_RE.test(fullyDecode(out)))
  ) {
    out = out.replace(ANY_URL_RE, (url) => {
      const [core, trail] = stripTrailing(url)
      const [beforeQ, rest] = splitOnce(core, '?')
      if (rest === undefined) return url
      return beforeQ + rewriteTail('?' + rest, false, ctx, depth) + trail
    })
  }
  return out
}

function rewriteRaw(s: string, ctx: IdentityContext): string {
  if (RELATIVE_PATH_RE.test(s)) return rewriteTail(s, true, ctx, 0, true)
  return rewriteUrls(rewriteStoragePaths(s, ctx), ctx, 0)
}

/** Rewrite every username-bearing path, link and param inside one string. */
export function rewriteIdentityInString(
  s: string,
  ctx: IdentityContext
): string {
  if (!mayCarryIdentity(s)) return s
  const out = rewriteRaw(s, ctx)
  // HTML entities or JSON-escaped slashes hide a shape from the raw pass.
  // Only then is the string normalized, so other strings keep their bytes.
  const norm = normalizeEscapes(out)
  if (norm !== out && mayCarryIdentity(norm)) {
    const rewritten = rewriteRaw(norm, ctx)
    if (rewritten !== norm) return rewritten
  }
  return out
}

// --- bare words in prose ---------------------------------------------------

const WORD_RE = /[A-Za-z0-9_-]+/g
// URL-like spans (absolute, bare-domain, markdown and inline site-relative
// links) are left to the URL rules and external links alone.
const URL_SPAN_RE =
  /(?:https?:\/\/|www\.)[^\s"'<>\\]+|(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}\/[^\s"'<>\\]*|\]\(\/[^)\s]*\)|(?<![\w.])\/[A-Za-z0-9_-]+\/[^\s"'<>\\)]+/g

/** Map each word outside URL spans; a dashed word is also tried part by part. */
export function mapWords(
  text: string,
  fn: (word: string) => string | undefined
): string {
  const mapPlain = (s: string) =>
    s.replace(WORD_RE, (tok) => {
      const whole = fn(tok)
      if (whole !== undefined) return whole
      if (!tok.includes('-')) return tok
      return tok
        .split('-')
        .map((p) => (p ? fn(p) ?? p : p))
        .join('-')
    })
  let out = ''
  let last = 0
  for (const m of text.matchAll(URL_SPAN_RE)) {
    const at = m.index ?? 0
    out += mapPlain(text.slice(last, at)) + m[0]
    last = at + m[0].length
  }
  return out + mapPlain(text.slice(last))
}

/** Handles (lowercased) that occur as words in `text`. */
export function handlesIn(
  text: string,
  names: NameIndex,
  into: Set<string>
): void {
  mapWords(text, (w) => {
    if (w.length >= 5 && names.handles.has(w.toLowerCase()))
      into.add(w.toLowerCase())
    return undefined
  })
}

// A word the bare-word rule must replace: a rare handle that isn't our output
// (unless a real user has that exact name).
function isRareHandleWord(
  w: string,
  names: NameIndex,
  ps: Pseudonymizer
): boolean {
  const k = w.toLowerCase()
  return (
    w.length >= 5 &&
    names.isRare(k) &&
    (!ps.isPseudonym(w) || names.usernames.has(k))
  )
}

/** Replace rare handles that match a real user with that user's pseudonym. */
export function rewriteBareNames(text: string, ctx: IdentityContext): string {
  return mapWords(text, (w) => {
    if (!isRareHandleWord(w, ctx.names, ctx.ps)) return undefined
    ctx.counts.bareUsernamesReplaced++
    return replacementFor(ctx.names.handles.get(w.toLowerCase()), ctx)
  })
}

// --- @handles ---------------------------------------------------------------
// Market descriptions mention people on other sites too ("@quillgazette"), so the
// description scrub only rewrites an @handle that is a Manifold username,
// current or historical, to that user's pseudonym. (Comments keep the blunter
// rule in redact.ts: every @handle becomes @user.) A username may contain
// dashes (nanoid suffixes), so a dashed handle is tried whole, then up to its
// first dash. Handles inside URLs are left alone: external links are kept as
// they are, and Manifold links have their own rules.

const AT_HANDLE_RE =
  /(?<![A-Za-z0-9_])@([A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?)/g

function mapOutsideUrls(text: string, fn: (plain: string) => string): string {
  let out = ''
  let last = 0
  for (const m of text.matchAll(URL_SPAN_RE)) {
    const at = m.index ?? 0
    out += fn(text.slice(last, at)) + m[0]
    last = at + m[0].length
  }
  return out + fn(text.slice(last))
}

function usernameAt(handle: string, names: NameIndex): string | undefined {
  if (names.usernames.has(handle.toLowerCase())) return handle
  const dash = handle.indexOf('-')
  const head = dash > 0 ? handle.slice(0, dash) : ''
  return head && names.usernames.has(head.toLowerCase()) ? head : undefined
}

/** "@handle" -> "@<pseudonym>" where the handle is a Manifold username. */
export function rewriteUserHandles(text: string, ctx: IdentityContext): string {
  if (!text.includes('@')) return text
  return mapOutsideUrls(text, (plain) =>
    plain.replace(AT_HANDLE_RE, (m, handle: string) => {
      const u = usernameAt(handle, ctx.names)
      if (!u) return m
      ctx.counts.descriptionHandlesRewritten++
      const owner = ctx.names.usernames.get(u.toLowerCase())
      return '@' + replacementFor(owner, ctx) + handle.slice(u.length)
    })
  )
}

/** @handles of Manifold users left in a string ('@user' is our placeholder). */
export function countUserHandles(text: string, names: NameIndex): number {
  if (!text.includes('@')) return 0
  let n = 0
  mapOutsideUrls(text, (plain) => {
    for (const m of plain.matchAll(AT_HANDLE_RE)) {
      const u = usernameAt(m[1], names)
      if (u && u.toLowerCase() !== 'user') n++
    }
    return plain
  })
  return n
}

/** The text nodes and prose attributes of a rich-text doc (or a plain string). */
export function textNodes(doc: unknown, out: string[] = []): string[] {
  if (typeof doc === 'string') out.push(doc)
  else if (Array.isArray(doc)) for (const d of doc) textNodes(d, out)
  else if (doc && typeof doc === 'object') {
    const node = doc as { text?: unknown; content?: unknown; attrs?: any }
    if (typeof node.text === 'string') out.push(node.text)
    for (const a of PROSE_ATTRS) {
      if (typeof node.attrs?.[a] === 'string') out.push(node.attrs[a])
    }
    if (Array.isArray(node.content)) textNodes(node.content, out)
  }
  return out
}

// --- display name next to its handle ----------------------------------------
// "Ostrander Quill (@OstranderQuill42)" is how Manifold names people in answers
// (dating markets list candidates this way) and pasted profiles. The handle
// alone may not be rare, and the display name is often a real name of any
// shape, so the pair is matched as a unit: a display name of the handle's OWN
// user right before the handle, with or without parentheses, separated by
// spaces or light punctuation, quoted or marked up. A public figure's name next
// to someone else's handle, or next to a handle that is no Manifold user, is
// left alone.

const PAIR_HANDLE_RE =
  /(?<![A-Za-z0-9_])(\(\s*)?@([A-Za-z0-9_](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?)(\s*\))?/g
// cleanDisplayName caps names at 30 characters
const MAX_NAME_WORDS = 15
// between a name and its handle: spaces, light punctuation, closing quotes
// and markdown emphasis
const PAIR_GAP_RE = /[\s\-–—:,|·•*~"'”’»)\]]*$/
// what may open a name: quotes, brackets, markdown emphasis
const NAME_OPEN_RE = /^["'“‘«([*~]+/

// The owner and [start, end) of a display name of the handle's owner that
// ends just before offset `at`.
function pairBefore(
  text: string,
  from: number,
  at: number,
  handle: string,
  names: NameIndex
): { owner: string; start: number; end: number } | null {
  const owner = names.usernames.get(handle.toLowerCase())
  if (!owner) return null
  const seg = text.slice(from, at).replace(PAIR_GAP_RE, '')
  const end = from + seg.length
  // [word, space, word, space, word]: a suffix of k words is the last 2k-1
  const parts = seg.split(/(\s+)/)
  for (let k = Math.min(MAX_NAME_WORDS, (parts.length + 1) / 2); k >= 1; k--) {
    const cand = parts.slice(parts.length - (2 * k - 1)).join('')
    for (const name of [cand, cand.replace(NAME_OPEN_RE, '')]) {
      const key = name.replace(/\s+/g, ' ').toLowerCase()
      if (key && names.displayNames.get(key)?.has(owner)) {
        return { owner, start: end - name.length, end }
      }
    }
  }
  return null
}

/** Replace "Display Name (@handle)" of one user with that user's pseudonym. */
export function rewriteNameHandlePairs(
  text: string,
  ctx: IdentityContext
): string {
  if (!text.includes('@')) return text
  let out = ''
  let last = 0
  for (const m of text.matchAll(PAIR_HANDLE_RE)) {
    const at = m.index ?? 0
    const pair = pairBefore(text, last, at, m[2], ctx.names)
    if (!pair) continue
    const p = ctx.ps.map(pair.owner)
    out += text.slice(last, pair.start) + p + text.slice(pair.end, at)
    out += `${m[1] ?? ''}@${p}${m[3] ?? ''}`
    last = at + m[0].length
    ctx.counts.nameHandlePairsReplaced++
  }
  return last === 0 ? text : out + text.slice(last)
}

/** Display-name/handle pairs of one user left in a string. */
export function countNameHandlePairs(text: string, names: NameIndex): number {
  if (!text.includes('@')) return 0
  let n = 0
  let last = 0
  for (const m of text.matchAll(PAIR_HANDLE_RE)) {
    const at = m.index ?? 0
    if (pairBefore(text, last, at, m[2], names)) n++
    last = at + m[0].length
  }
  return n
}

type Row = Record<string, any>

// Node attributes that hold prose: a link preview's fetched title and
// description, an image's alt text. (A mention's label is set to 'user' in
// redact.ts; a contract mention's label is a path, handled as a URL.)
export const PROSE_ATTRS = ['title', 'description', 'alt']

function mapAttrs(node: any, fn: (s: string) => string): void {
  const attrs = node.attrs
  if (!attrs || typeof attrs !== 'object') return
  for (const a of PROSE_ATTRS) {
    if (typeof attrs[a] === 'string') attrs[a] = fn(attrs[a])
  }
}

// Adjacent text nodes are one string to `fn`: formatting splits a name
// ("**Jane** (@x)") into nodes but not on the page. The result goes back over
// the run as one edit, placed in the node where the change starts; nodes the
// edit empties are dropped.
function mapRun(nodes: any[], fn: (s: string) => string): boolean {
  const old = nodes.map((n) => n.text).join('')
  const next = fn(old)
  if (next === old) return false
  if (nodes.length === 1) {
    nodes[0].text = next
    return false
  }
  let p = 0
  while (p < old.length && p < next.length && old[p] === next[p]) p++
  let s = 0
  while (
    s < old.length - p &&
    s < next.length - p &&
    old[old.length - 1 - s] === next[next.length - 1 - s]
  )
    s++
  const q = old.length - s
  const insert = next.slice(p, next.length - s)
  const starts: number[] = []
  let pos = 0
  for (const n of nodes) {
    starts.push(pos)
    pos += n.text.length
  }
  const target = nodes.findIndex((n, i) => starts[i] + n.text.length > p)
  const into = target === -1 ? nodes.length - 1 : target
  nodes.forEach((n, i) => {
    const a = starts[i]
    const len = n.text.length
    const left = n.text.slice(0, Math.min(Math.max(p - a, 0), len))
    const right = n.text.slice(Math.min(Math.max(q - a, 0), len))
    if (i === into) n.text = left + insert + right
    else if (a < q && a + len > p) n.text = left + right
  })
  return true
}

function mapContent(content: any[], fn: (s: string) => string): void {
  let run: any[] = []
  let edited = false
  const flush = () => {
    if (run.length && mapRun(run, fn)) edited = true
    run = []
  }
  for (const c of content) {
    if (c && typeof c === 'object' && typeof c.text === 'string') {
      run.push(c)
      continue
    }
    flush()
    if (c && typeof c === 'object') {
      mapAttrs(c, fn)
      if (Array.isArray(c.content)) mapContent(c.content, fn)
    }
  }
  flush()
  if (edited) {
    for (let i = content.length - 1; i >= 0; i--) {
      if (content[i]?.text === '') content.splice(i, 1)
    }
  }
}

function mapRichText(node: any, fn: (s: string) => string): void {
  if (Array.isArray(node)) return mapContent(node, fn)
  if (!node || typeof node !== 'object') return
  if (typeof node.text === 'string') node.text = fn(node.text)
  mapAttrs(node, fn)
  if (Array.isArray(node.content)) mapContent(node.content, fn)
}

export const PROSE_TABLES: TableName[] = [
  'contracts',
  'answers',
  'contract_comments',
]

/**
 * Apply `fn` to every free-text field of a row: where a handle can appear as
 * a plain word. URL rewriting covers every string; this list is only prose.
 * `copies: false` skips denormalized copies of another row's text (a
 * comment's contractQuestion), so the rarity tally counts each text once.
 */
export function mapProse(
  table: TableName,
  row: Row,
  fn: (s: string) => string,
  opts: { copies?: boolean } = {}
): void {
  if (!PROSE_TABLES.includes(table)) return
  const str = (obj: Row | undefined, key: string) => {
    if (obj && typeof obj[key] === 'string') obj[key] = fn(obj[key])
  }
  const d = row.data
  if (table === 'contracts') {
    str(row, 'question')
    if (!d) return
    str(d, 'question')
    if (typeof d.description === 'string') str(d, 'description')
    else mapRichText(d.description, fn)
    for (const a of Array.isArray(d.answers) ? d.answers : []) {
      str(a, 'text')
      str(a, 'shortText')
    }
    for (const o of Array.isArray(d.options) ? d.options : []) str(o, 'text')
    str(d, 'gptCommentSummary')
    str(d, 'aiDescription')
  } else if (table === 'answers') {
    str(row, 'text')
    str(row, 'short_text')
  } else {
    if (!d) return
    mapRichText(d.content, fn)
    str(d, 'text')
    if (opts.copies !== false) str(d, 'contractQuestion')
  }
}

/** Handles occurring in one row's prose, for the rarity tally. */
export function proseHandles(
  table: TableName,
  row: Row,
  names: NameIndex
): Set<string> {
  const found = new Set<string>()
  mapProse(
    table,
    row,
    (s) => {
      handlesIn(s, names, found)
      return s
    },
    { copies: false }
  )
  return found
}

// --- detection (validator) -------------------------------------------------

export interface IdentityLeaks {
  namePathLeaks: number
  nameQueryLeaks: number
  previewParamLeaks: number
}

export function emptyLeaks(): IdentityLeaks {
  return { namePathLeaks: 0, nameQueryLeaks: 0, previewParamLeaks: 0 }
}

function isKnownUsername(seg: string, names: NameIndex): boolean {
  return names.usernames.has(seg.toLowerCase())
}

function decodeReferral(v: string): string {
  try {
    return Buffer.from(v.replace(/ /g, '+'), 'base64').toString('utf8')
  } catch {
    return ''
  }
}

// Identity params by meaning, preview params anywhere, and any value that is
// a rare handle. Other values are left alone: a common query value ("newest")
// can equal somebody's name without naming them.
function scanQuery(
  query: string,
  manifold: boolean,
  names: NameIndex,
  out: IdentityLeaks
) {
  for (const pair of query.split(/&amp;|&/)) {
    const [key, val = ''] = splitOnce(pair, '=')
    if (PREVIEW_PARAMS.has(key) && val.trim()) out.previewParamLeaks++
    if (!manifold || !val) continue
    if (key === 'r' && isKnownUsername(decodeReferral(val), names))
      out.nameQueryLeaks++
    else if (
      (key === 'referrer' || key === 'username') &&
      isKnownUsername(val, names)
    )
      out.nameQueryLeaks++
    else if (names.isRare(val.toLowerCase())) out.nameQueryLeaks++
  }
}

function scanPath(
  path: string,
  names: NameIndex,
  ps: Pseudonymizer,
  out: IdentityLeaks
) {
  const segs = path.split('/')
  const { i, routes } = userSegment(segs)
  if (i < 0) return
  const hit = classify(segs[i], routes, names, ps)
  if (hit && isKnownUsername(segs[i], names)) out.namePathLeaks++
}

function scanTail(
  tail: string,
  manifold: boolean,
  names: NameIndex,
  ps: Pseudonymizer,
  out: IdentityLeaks
) {
  const [beforeFrag] = splitOnce(tail.replace(TRAILING_PUNCT_RE, ''), '#')
  const [path, query] = splitOnce(beforeFrag, '?')
  if (manifold) scanPath(path, names, ps, out)
  if (query !== undefined) scanQuery(query, manifold, names, out)
}

/**
 * Count real usernames left in paths and query strings of one string, and
 * preview params left on any URL. Runs on the fully decoded string, so it sees
 * through nesting and encodings the rewriter may have missed.
 */
export function findIdentityLeaks(
  s: string,
  names: NameIndex,
  ps: Pseudonymizer,
  out: IdentityLeaks
): void {
  if (!mayCarryIdentity(s)) return
  const d = decodeAll(s)
  if (RELATIVE_PATH_RE.test(d)) scanTail(d, true, names, ps, out)
  for (const m of d.matchAll(STORAGE_RE)) {
    const seg = m[3]
    if (SHARED_SEGMENTS.has(seg) || !isKnownUsername(seg, names)) continue
    out.namePathLeaks++
  }
  // Restart after each host rather than after each match, so a link nested in
  // another link's query (now decoded) is checked as a link of its own.
  const links = new RegExp(MANIFOLD_LINK_RE.source, 'gi')
  for (let m = links.exec(d); m; m = links.exec(d)) {
    links.lastIndex = m.index + m[1].length
    if (m[2]) scanTail(m[2], true, names, ps, out)
  }
  for (const m of d.matchAll(MD_RELATIVE_LINK_RE))
    scanTail(m[1], true, names, ps, out)
  if (PREVIEW_PARAM_RE.test(d)) {
    const urls = new RegExp(ANY_URL_RE.source, 'gi')
    for (let m = urls.exec(d); m; m = urls.exec(d)) {
      urls.lastIndex = m.index + m[0].indexOf('//') + 2
      // manifold.markets links were scanned above
      if (/^https?:\/\/(?:www\.|dev\.)?manifold\.markets/i.test(m[0])) continue
      const [, query] = splitOnce(m[0], '?')
      if (query !== undefined) scanQuery(query, false, names, out)
    }
  }
}

/** Rare handles left as words in one row's prose. */
export function countBareNames(
  table: TableName,
  row: Row,
  names: NameIndex,
  ps: Pseudonymizer
): number {
  let n = 0
  mapProse(table, row, (s) => {
    mapWords(s, (w) => {
      if (isRareHandleWord(w, names, ps)) n++
      return undefined
    })
    return s
  })
  return n
}
